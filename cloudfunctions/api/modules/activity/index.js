/**
 * 事件树 - Activity 云函数模块
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const auth = require('../../common/auth');
const permission = require('../../common/permission');
const { success, fail } = require('../../common/response');
const { validateObjectId } = require('../../common/validator');
const { getAll } = require('../../common/query');
const { TASK_STATUS } = require('../../common/constants');
const PS_DEF = 20, PS_MAX = 50;
const TFM = { all: null, project: 'project', task: 'task', group: 'group' };
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_ORDER = { core: 0, important: 1, optional: 2 };

async function pending(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  try {
    const generatedAt = new Date();
    const boundaries = shanghaiDayBoundaries(generatedAt);
    const tasks = await getAll(db.collection('tasks').where({
      ownerId: openid,
      deletedAt: _.eq(null),
      status: _.nin([TASK_STATUS.COMPLETED, TASK_STATUS.APPROVED, TASK_STATUS.CLOSED_BY_PARENT, TASK_STATUS.CANCELLED]),
      dueAt: _.lt(boundaries.upcomingEnd)
    }).field({
      _id: true, projectId: true, groupId: true, title: true,
      priority: true, status: true, scheduleType: true,
      startAt: true, dueAt: true
    }));
    const validTasks = tasks.filter(task => isValidDate(task.dueAt));
    const projectMap = await loadOwnedProjects(openid, validTasks);
    const groupMap = await loadGroups(validTasks);
    const sections = { overdue: [], today: [], upcoming: [] };
    for (const task of validTasks) {
      const project = projectMap[task.projectId];
      if (!project) continue;
      const dueAt = new Date(task.dueAt);
      const category = classifyDueAt(dueAt, boundaries);
      if (!category) continue;
      const candidateGroup = task.groupId ? groupMap[task.groupId] : null;
      const group = candidateGroup && candidateGroup.projectId === task.projectId ? candidateGroup : null;
      sections[category].push({
        _id: task._id, projectId: task.projectId, projectTitle: project.title || '',
        title: task.title || '未命名任务',
        priority: PRIORITY_ORDER[task.priority] === undefined ? 'optional' : task.priority,
        status: task.status || TASK_STATUS.TODO,
        scheduleType: task.scheduleType || 'deadline', timeMode: task.scheduleType || 'deadline',
        startAt: task.startAt || null, dueAt: dueAt.toISOString(),
        overdue: category === 'overdue', groupId: task.groupId || null,
        groupName: group ? group.name || '' : ''
      });
    }
    for (const key of Object.keys(sections)) sections[key].sort(comparePendingTasks);
    const summary = {
      overdue: sections.overdue.length, today: sections.today.length, upcoming: sections.upcoming.length,
      total: sections.overdue.length + sections.today.length + sections.upcoming.length
    };
    return success({ summary, sections, generatedAt: generatedAt.toISOString(), timezone: 'Asia/Shanghai' });
  } catch (err) {
    console.error('[activity.pending]', err);
    return fail('INTERNAL_ERROR', '待处理任务查询失败');
  }
}

function shanghaiDayBoundaries(now) {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SHANGHAI_OFFSET_MS;
  return { todayStart: new Date(start), tomorrowStart: new Date(start + DAY_MS), upcomingEnd: new Date(start + 8 * DAY_MS) };
}

function classifyDueAt(dueAt, boundaries) {
  const time = dueAt.getTime();
  if (time < boundaries.todayStart.getTime()) return 'overdue';
  if (time < boundaries.tomorrowStart.getTime()) return 'today';
  if (time < boundaries.upcomingEnd.getTime()) return 'upcoming';
  return '';
}

function comparePendingTasks(a, b) {
  const timeDiff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  if (timeDiff) return timeDiff;
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff) return priorityDiff;
  return String(a._id).localeCompare(String(b._id));
}

function isValidDate(value) {
  const date = value ? new Date(value) : null;
  return Boolean(date && !Number.isNaN(date.getTime()));
}

async function loadOwnedProjects(openid, tasks) {
  const ids = [...new Set(tasks.map(task => task.projectId).filter(Boolean))];
  const rows = await Promise.all(ids.map(id => db.collection('projects').doc(id).get().catch(() => ({ data: null }))));
  const map = {};
  for (const row of rows) {
    const project = row.data;
    if (project && !project.deletedAt && permission.canReadProject(openid, project)) map[project._id] = project;
  }
  return map;
}

async function loadGroups(tasks) {
  const ids = [...new Set(tasks.map(task => task.groupId).filter(Boolean))];
  const rows = await Promise.all(ids.map(id => db.collection('project_groups').doc(id).get().catch(() => ({ data: null }))));
  const map = {};
  for (const row of rows) {
    const group = row.data;
    if (group && !group.deletedAt) map[group._id] = group;
  }
  return map;
}
async function list(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  try {
    const page = Math.max(1, Number(payload.page) || 1);
    const pageSize = Math.min(PS_MAX, Math.max(1, Number(payload.pageSize) || PS_DEF));
    const skip = (page - 1) * pageSize;
    const filter = { operatorId: openid };
    const tt = TFM[payload.type] || null;
    if (tt) filter.targetType = tt;
    if (payload.projectId) { const ck = validateObjectId(payload.projectId); if (ck.valid) filter.projectId = ck.value; }
    if (payload.startAt) filter.createdAt = _.gte(new Date(payload.startAt));
    if (payload.endAt) { const ef = _.lte(new Date(payload.endAt)); filter.createdAt = filter.createdAt ? _.and([filter.createdAt, ef]) : ef; }
    const res = await db.collection('activity_logs').where(filter).orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get();
    const nx = await db.collection('activity_logs').where(filter).orderBy('createdAt', 'desc').skip(skip + pageSize).limit(1).get();
    const list = await enrichLogs(res.data);
    let total = -1;
    try { const cr = await db.collection('activity_logs').where(filter).count(); total = cr.total; } catch (e) {}
    return success({ list, page, pageSize, hasMore: nx.data.length > 0, total: total >= 0 ? total : undefined });
  } catch (err) { console.error('[activity.list]', err); return fail('INTERNAL_ERROR', '查询失败'); }
}
async function listByProject(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const ck = validateObjectId(payload.projectId);
  if (!ck.valid) return fail('INVALID_PARAMS', ck.message);
  try {
    const proj = await db.collection('projects').doc(ck.value).get().catch(() => ({ data: null }));
    if (!proj.data || !permission.canReadProject(openid, proj.data)) return fail('FORBIDDEN', '无权查看');
    const page = Math.max(1, Number(payload.page) || 1);
    const pageSize = Math.min(PS_MAX, Math.max(1, Number(payload.pageSize) || PS_DEF));
    const skip = (page - 1) * pageSize;
    const filter = { projectId: ck.value };
    const res = await db.collection('activity_logs').where(filter).orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get();
    const nx = await db.collection('activity_logs').where(filter).orderBy('createdAt', 'desc').skip(skip + pageSize).limit(1).get();
    return success({ list: await enrichLogs(res.data), page, pageSize, hasMore: nx.data.length > 0 });
  } catch (err) { return fail('INTERNAL_ERROR', '查询失败'); }
}
async function enrichLogs(logs) {
  if (!logs || logs.length === 0) return [];
  const pids = new Set(), tids = new Set();
  for (const l of logs) {
    const pt = l.projectId || l.project_id; if (pt) pids.add(pt);
    const tt = l.taskId || l.task_id; if (tt && (l.targetType === 'task' || !l.targetType)) tids.add(tt);
  }
  const pmap = {};
  if (pids.size > 0) {
    const pa = await db.collection('projects').where({ _id: _.in([...pids]) }).field({ _id: true, title: true, deletedAt: true }).get().catch(() => ({ data: [] }));
    for (const p of (pa.data || [])) pmap[p._id] = { exists: true, canNavigate: !p.deletedAt, title: p.title || '' };
    for (const pid of pids) { if (!pmap[pid]) pmap[pid] = { exists: false, canNavigate: false, title: '' }; }
  }
  const tmap = {};
  if (tids.size > 0) {
    const ta = await db.collection('tasks').where({ _id: _.in([...tids]) }).field({ _id: true, title: true, deletedAt: true }).get().catch(() => ({ data: [] }));
    for (const t of (ta.data || [])) tmap[t._id] = { exists: true, canNavigate: !t.deletedAt, title: t.title || '' };
    for (const tid of tids) { if (!tmap[tid]) tmap[tid] = { exists: false, canNavigate: false, title: '' }; }
  }
  return logs.map(function(l) {
    const pid = l.projectId || l.project_id || '';
    let cat = ''; try { const d = new Date(l.createdAt); if (!isNaN(d.getTime())) cat = d.toISOString(); } catch (e) {}
    const pj = pmap[pid]; const ts = l.targetTitleSnapshot || l.titleSnapshot || '';
    return {
      id: l._id, action: l.action || '', targetType: l.targetType || '', targetId: l.targetId || l.target_id || '',
      projectId: pid, taskId: l.taskId || l.task_id || null, groupId: l.groupId || l.group_id || null,
      title: ts || (pj ? pj.title : '') || '未命名', projectTitle: pj ? pj.title : '', description: '',
      before: cleanChanges(l.before), after: cleanChanges(l.after),
      metadata: l.metadata || {}, createdAt: cat,
      canNavigate: pj ? pj.canNavigate : false, targetExists: pj ? pj.exists : false
    };
  });
}
function cleanChanges(obj) {
  if (!obj || typeof obj !== 'object') return {};
  var r = {}, s = ['ownerId','creatorId','assigneeId','teamId','openid','operatorId','actorId','completedBy','deletedAt','version','updatedAt','createdAt','visibleTo','taskCountCache','completedTaskCountCache','progressCache','statusBeforeParentClose','closedBy','archivedAt'];
  for (var k in obj) { if (s.indexOf(k) !== -1) continue; r[k] = obj[k]; }
  return r;
}
module.exports = { pending, list, listByProject, _test: { shanghaiDayBoundaries, classifyDueAt, comparePendingTasks } };
