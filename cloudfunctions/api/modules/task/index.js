const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const auth = require('../../common/auth');
const permission = require('../../common/permission');
const { success, fail } = require('../../common/response');
const { validateTaskTitle, validatePriority, validateScheduleType, validateObjectId } = require('../../common/validator');
const { SCHEDULE_TYPE, TASK_STATUS } = require('../../common/constants');
const { writeActivityLog } = require('../../common/logger');
const { recalculateProjectProgress } = require('../../common/project-progress');
const { getEffectiveDueAt, normalizeTaskTimePayload } = require('../../common/task-time');
const { getAll } = require('../../common/query');
const { normalizeReminderConfig, calculateScheduledAt, syncTaskReminder, cancelTaskReminder } = require('../../common/reminder');

async function ownedProject(openid, projectId) { const r = await db.collection('projects').doc(projectId).get().catch(() => ({ data: null })); return r.data && !r.data.deletedAt && permission.canEditProject(openid, r.data) ? r.data : null; }
async function rawOwnedProject(openid, projectId) { const r = await db.collection('projects').doc(projectId).get().catch(() => ({ data: null })); return r.data && permission.canReadProject(openid, r.data) ? r.data : null; }
async function defaultReminderConfig(openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
  const user = result.data && result.data[0] ? result.data[0] : {};
  const mode = user.defaultReminderMode || 'offset';
  return { reminderMode: mode, reminderOffsetMinutes: mode === 'offset' ? (user.defaultReminderMinutes || 30) : null, reminderCustomAt: null };
}
function reminderFields(payload, fallback, scheduleType) {
  if (scheduleType === SCHEDULE_TYPE.NONE) return { data: { reminderMode: 'none', reminderOffsetMinutes: null, reminderCustomAt: null } };
  return normalizeReminderConfig(payload, fallback);
}
function reminderScheduleError(config, dueAt) {
  const result = calculateScheduledAt(config, dueAt);
  return result.error || '';
}
async function safelySyncReminder(task, project) {
  try { return await syncTaskReminder(db, task, project); }
  catch (error) { console.warn('[task] reminder sync failed:', task && task._id, error.message); return { warning: '提醒暂未同步，请稍后重试' }; }
}
async function safelyCancelReminder(task, includeTriggered = true) {
  try { return await cancelTaskReminder(db, task.ownerId, task._id, { includeTriggered }); }
  catch (error) { console.warn('[task] reminder cancel failed:', task && task._id, error.message); return { warning: '提醒取消失败' }; }
}
function input(payload) {
  const title = validateTaskTitle(payload.title); if (!title.valid) return { error: title.message };
  if (payload.note !== undefined && typeof payload.note !== 'string') return { error: '备注格式无效' };
  if (typeof payload.note === 'string' && payload.note.trim().length > 500) return { error: '备注不能超过500字' };
  const priority = validatePriority(payload.priority || 'important'); if (!priority.valid) return { error: priority.message };
  const scheduleType = validateScheduleType(payload.scheduleType || SCHEDULE_TYPE.NONE); if (!scheduleType.valid) return { error: scheduleType.message };
  const normalizedTime = normalizeTaskTimePayload(scheduleType.value, payload);
  if (normalizedTime.error) return { error: normalizedTime.error, code: 'INVALID_TIME_RANGE' };
  return { data: { title: title.value, note: typeof payload.note === 'string' ? payload.note.trim().slice(0, 500) : '', priority: priority.value, scheduleType: scheduleType.value, ...normalizedTime.data, groupId: typeof payload.groupId === 'string' && payload.groupId ? payload.groupId : null } };
}
async function verifyGroup(projectId, groupId) { if (!groupId) return true; const r = await db.collection('project_groups').doc(groupId).get().catch(() => ({ data: null })); return !!(r.data && !r.data.deletedAt && r.data.projectId === projectId); }
async function create(payload, context) {
  const openid = auth.getUserId(context); const projectId = validateObjectId(payload.projectId); const parsed = input(payload);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!projectId.valid || parsed.error) return fail(parsed.code || 'INVALID_PARAMS', projectId.valid ? parsed.error : projectId.message);
  const project = await ownedProject(openid, projectId.value); if (!project) return fail('PROJECT_NOT_FOUND', '事件不存在或无权操作');
  if (project.status !== 'active') return fail('FORBIDDEN', '只有进行中的事件才能添加任务'); if (!await verifyGroup(project._id, parsed.data.groupId)) return fail('GROUP_NOT_FOUND', '分组不存在');
  const fallback = await defaultReminderConfig(openid);
  const reminder = reminderFields(payload, fallback, parsed.data.scheduleType);
  if (reminder.error) return fail('INVALID_PARAMS', reminder.error);
  const reminderError = reminderScheduleError(reminder.data, parsed.data.dueAt);
  if (reminderError) return fail('INVALID_PARAMS', reminderError);
  const last = await db.collection('tasks').where({ projectId: project._id, groupId: parsed.data.groupId, deletedAt: null }).orderBy('sortOrder', 'desc').limit(1).get();
  const doc = { ...parsed.data, ...reminder.data, projectId: project._id, ownerId: openid, creatorId: openid, assigneeId: openid, teamId: null, sourceType: 'personal', approvalRequired: false, parentTaskId: null, level: 1, pathIds: [], status: TASK_STATUS.TODO, completedAt: null, completedBy: null, statusBeforeParentClose: null, deletedAt: null, sortOrder: last.data.length ? last.data[0].sortOrder + 1000 : 1000, createdAt: db.serverDate(), updatedAt: db.serverDate() };
  const result = await db.collection('tasks').add({ data: doc }); const progress = await recalculateProjectProgress(project._id);
  const task = { ...doc, _id: result._id };
  const reminderResult = await safelySyncReminder(task, project);
  await writeActivityLog({ projectId: project._id, taskId: result._id, operatorId: openid, action: 'task.created', targetType: 'task', targetId: result._id, targetTitleSnapshot: doc.title, after: parsed.data, visibleTo: [openid] });
  return success({ task, progress, reminderWarning: reminderResult.warning || '' }, '任务已创建');
}
async function listByProject(payload, context) { const openid = auth.getUserId(context); const id = validateObjectId(payload.projectId); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message); const project = await ownedProject(openid, id.value); if (!project) return fail('PROJECT_NOT_FOUND', '事件不存在或无权访问'); const r = await db.collection('tasks').where({ projectId: project._id, deletedAt: null }).orderBy('sortOrder', 'asc').limit(100).get(); return success({ tasks: r.data }); }
async function listDeleted(payload, context) { const openid = auth.getUserId(context); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); const rows = await getAll(db.collection('tasks').where({ ownerId: openid, deletedAt: _.neq(null) }).orderBy('updatedAt', 'desc')); const tasks = rows.filter(item => item && item.deletedAt); const projectIds = [...new Set(tasks.map(item => item.projectId).filter(Boolean))]; const projects = await Promise.all(projectIds.map(id => rawOwnedProject(openid, id))); const map = {}; projects.filter(Boolean).forEach(item => { map[item._id] = item; }); return success({ tasks: tasks.map(item => ({ ...item, projectTitle: map[item.projectId] ? map[item.projectId].title : '原事件不存在', parentProjectDeleted: !!(map[item.projectId] && map[item.projectId].deletedAt) })) }); }
async function get(payload, context) { const openid = auth.getUserId(context); const id = validateObjectId(payload.taskId); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message); const r = await db.collection('tasks').doc(id.value).get().catch(() => ({ data: null })); const task = r.data; const project = task && await ownedProject(openid, task.projectId); return task && project && !task.deletedAt ? success({ task }) : fail('NOT_FOUND', '任务不存在或无权访问'); }
async function update(payload, context) {
  const openid = auth.getUserId(context), id = validateObjectId(payload.taskId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const row = await db.collection('tasks').doc(id.value).get().catch(() => ({ data: null }));
  const task = row.data;
  if (!task || task.deletedAt) return fail('TASK_NOT_FOUND', '任务不存在');
  const parsed = input(payload);
  if (parsed.error) return fail(parsed.code || 'INVALID_PARAMS', parsed.error);
  const project = await ownedProject(openid, task.projectId);
  if (!project) return fail('FORBIDDEN', '无权修改该任务');
  if (project.status !== 'active') return fail('FORBIDDEN', '只有进行中的事件才能修改任务');
  if (!await verifyGroup(project._id, parsed.data.groupId)) return fail('GROUP_NOT_FOUND', '分组不存在');
  const reminder = reminderFields(payload, task, parsed.data.scheduleType);
  if (reminder.error) return fail('INVALID_PARAMS', reminder.error);
  const reminderError = reminderScheduleError(reminder.data, parsed.data.dueAt);
  if (reminderError) return fail('INVALID_PARAMS', reminderError);
  const updateData = { ...parsed.data, ...reminder.data };
  await db.collection('tasks').doc(task._id).update({ data: { ...updateData, updatedAt: db.serverDate() } });
  const reminderResult = await safelySyncReminder({ ...task, ...updateData }, project);
  const progress = await recalculateProjectProgress(project._id);
  await writeActivityLog({ projectId: project._id, taskId: task._id, operatorId: openid, action: 'task.updated', targetType: 'task', targetId: task._id, targetTitleSnapshot: parsed.data.title, before: { title: task.title, groupId: task.groupId, priority: task.priority, scheduleType: task.scheduleType, startAt: task.startAt, endAt: task.endAt, dueAt: task.dueAt }, after: updateData, visibleTo: [openid] });
  return success({ progress, reminderWarning: reminderResult.warning || '' }, '任务已更新');
}
async function toggle(payload, context, completed) { const openid = auth.getUserId(context); const id = validateObjectId(payload.taskId); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message); const r = await db.collection('tasks').doc(id.value).get().catch(() => ({ data: null })); const task = r.data; if (!task || task.deletedAt) return fail('TASK_NOT_FOUND', '任务不存在'); const project = await ownedProject(openid, task.projectId); if (!project) return fail('FORBIDDEN', '无权操作该任务');
  if (project.status !== 'active') return fail('FORBIDDEN', '只有进行中的事件才能操作任务'); const expected = completed ? TASK_STATUS.TODO : TASK_STATUS.COMPLETED, target = completed ? TASK_STATUS.COMPLETED : TASK_STATUS.TODO; if (task.status === target) return success({ progress: await recalculateProjectProgress(project._id) }, completed ? '任务已完成' : '任务已是未完成状态'); if (task.status !== expected) return fail('VERSION_CONFLICT', '任务状态已变化，请刷新后重试'); const after = completed ? { status: target, completedAt: db.serverDate(), completedBy: openid, updatedAt: db.serverDate() } : { status: target, completedAt: null, completedBy: null, updatedAt: db.serverDate() }; const changed = await db.collection('tasks').where({ _id: task._id, status: expected, deletedAt: null }).update({ data: after }); if (!changed.stats.updated) return success({ progress: await recalculateProjectProgress(project._id) }, '任务状态已更新'); const reminderResult = completed ? await safelyCancelReminder(task) : await safelySyncReminder({ ...task, status: target, completedAt: null, completedBy: null }, project); const progress = await recalculateProjectProgress(project._id); await writeActivityLog({ projectId: project._id, taskId: task._id, operatorId: openid, action: completed ? 'task.completed' : 'task.reopened', targetType: 'task', targetId: task._id, targetTitleSnapshot: task.title, before: { status: expected }, after: { status: target }, visibleTo: [openid] }); return success({ progress, reminderWarning: reminderResult.warning || '' }, completed ? '任务已完成' : '任务已重新打开'); }
async function complete(payload, context) { return toggle(payload, context, true); } async function reopen(payload, context) { return toggle(payload, context, false); }
async function softDelete(payload, context) { const openid = auth.getUserId(context); const id = validateObjectId(payload.taskId); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message); const r = await db.collection('tasks').doc(id.value).get().catch(() => ({ data: null })); const task = r.data; if (!task || task.deletedAt) return fail('TASK_NOT_FOUND', '任务不存在'); const project = await ownedProject(openid, task.projectId); if (!project) return fail('FORBIDDEN', '无权删除该任务');
  if (project.status !== 'active') return fail('FORBIDDEN', '只有进行中的事件才能删除任务'); await db.collection('tasks').doc(task._id).update({ data: { deletedAt: db.serverDate(), updatedAt: db.serverDate() } }); const reminderResult = await safelyCancelReminder(task); const progress = await recalculateProjectProgress(project._id); await writeActivityLog({ projectId: project._id, taskId: task._id, operatorId: openid, action: 'task.deleted', targetType: 'task', targetId: task._id, targetTitleSnapshot: task.title, before: { deletedAt: null }, after: { deletedAt: 'serverDate' }, visibleTo: [openid] }); return success({ progress, reminderWarning: reminderResult.warning || '' }, '任务已移入回收站'); }
async function restore(payload, context) { const openid = auth.getUserId(context); const id = validateObjectId(payload.taskId); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message); const r = await db.collection('tasks').doc(id.value).get().catch(() => ({ data: null })); const task = r.data; if (!task || !task.deletedAt) return fail('TASK_NOT_FOUND', '回收站中未找到任务'); const project = await rawOwnedProject(openid, task.projectId); if (!project) return fail('FORBIDDEN', '无权恢复该任务'); if (project.deletedAt) return fail('TASK_PARENT_PROJECT_DELETED', '请先恢复所属事件'); let groupId = task.groupId; if (groupId && !await verifyGroup(project._id, groupId)) groupId = null; await db.collection('tasks').doc(task._id).update({ data: { deletedAt: null, groupId, updatedAt: db.serverDate() } }); const reminderResult = await safelySyncReminder({ ...task, deletedAt: null, groupId }, project); const progress = await recalculateProjectProgress(project._id); await writeActivityLog({ projectId: project._id, taskId: task._id, operatorId: openid, action: 'task.restored', targetType: 'task', targetId: task._id, targetTitleSnapshot: task.title, before: { deletedAt: task.deletedAt, groupId: task.groupId }, after: { deletedAt: null, groupId }, visibleTo: [openid] }); return success({ progress, reminderWarning: reminderResult.warning || '' }, '任务已恢复'); }
async function reorder(payload, context) { const openid = auth.getUserId(context); const id = validateObjectId(payload.projectId); const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : []; if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message); const project = await ownedProject(openid, id.value); if (!project) return fail('PROJECT_NOT_FOUND', '事件不存在或无权操作');
  if (project.status !== 'active') return fail('FORBIDDEN', '只有进行中的事件才能排序任务'); if (!taskIds.length || new Set(taskIds).size !== taskIds.length) return fail('INVALID_REORDER', '任务排序数据无效'); const rows = await Promise.all(taskIds.map(taskId => db.collection('tasks').doc(taskId).get().catch(() => ({ data: null })))); const tasks = rows.map(row => row.data); if (tasks.some(task => !task || task.deletedAt || task.projectId !== project._id)) return fail('INVALID_REORDER', '排序中包含无效任务'); const groupId = tasks[0].groupId || null; if (tasks.some(task => (task.groupId || null) !== groupId)) return fail('INVALID_REORDER', '只能在同一分组内排序'); const expected = await db.collection('tasks').where({ projectId: project._id, groupId, deletedAt: null }).get(); const expectedIds = expected.data.map(item => item._id).sort(), receivedIds = [...taskIds].sort(); if (expectedIds.length !== receivedIds.length || expectedIds.some((value, index) => value !== receivedIds[index])) return fail('VERSION_CONFLICT', '任务列表已变化，请刷新后重试'); await Promise.all(taskIds.map((taskId, i) => db.collection('tasks').doc(taskId).update({ data: { sortOrder: (i + 1) * 1000, updatedAt: db.serverDate() } }))); await writeActivityLog({ projectId: project._id, taskId: taskIds[0], operatorId: openid, action: 'task.reordered', targetType: 'task', targetTitleSnapshot: '任务排序', after: { groupId, taskIds }, visibleTo: [openid] }); return success(null, '任务排序已保存'); }
module.exports = { create, listByProject, listDeleted, get, update, complete, reopen, softDelete, restore, reorder };
