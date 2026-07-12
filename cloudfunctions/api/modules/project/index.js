const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const auth = require('../../common/auth');
const permission = require('../../common/permission');
const { success, fail } = require('../../common/response');
const { validateProjectTitle, validateTimeMode, validateObjectId } = require('../../common/validator');
const { TIME_MODE, PROJECT_STATUS } = require('../../common/constants');
const { writeActivityLog } = require('../../common/logger');

function cleanProjectInput(payload) {
  const title = validateProjectTitle(payload.title);
  if (!title.valid) return { error: title.message };
  const timeMode = validateTimeMode(payload.timeMode || TIME_MODE.NONE);
  if (!timeMode.valid) return { error: timeMode.message };
  const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 1000) : '';
  const startAt = payload.startAt ? new Date(payload.startAt) : null;
  const endAt = payload.endAt ? new Date(payload.endAt) : null;
  if (timeMode.value === TIME_MODE.RANGE && (!startAt || !endAt || endAt < startAt)) return { error: '请正确设置起止日期' };
  if (timeMode.value === TIME_MODE.ONGOING && !startAt) return { error: '请设置开始日期' };
  return { data: {
    title: title.value, description, timeMode: timeMode.value,
    startAt: timeMode.value === TIME_MODE.NONE ? null : startAt,
    endAt: timeMode.value === TIME_MODE.RANGE ? endAt : null,
    icon: typeof payload.icon === 'string' ? payload.icon.slice(0, 24) : 'circle',
    themeColor: typeof payload.themeColor === 'string' ? payload.themeColor.slice(0, 16) : '#FF6B35'
  }};
}

async function getOwnedProject(projectId, openid) {
  const res = await db.collection('projects').doc(projectId).get().catch(() => ({ data: null }));
  const project = res.data;
  return project && permission.canReadProject(openid, project) ? project : null;
}

async function create(payload, context) {
  const openid = auth.getUserId(context); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const parsed = cleanProjectInput(payload); if (parsed.error) return fail('INVALID_PARAMS', parsed.error);
  const doc = {
    ...parsed.data, ownerId: openid, creatorId: openid, assigneeId: openid,
    teamId: null, sourceType: 'personal', visibility: 'private', approvalRequired: false,
    status: PROJECT_STATUS.ACTIVE, deletedAt: null, taskCountCache: 0,
    completedTaskCountCache: 0, progressCache: 0, createdAt: db.serverDate(), updatedAt: db.serverDate(), version: 1
  };
  const result = await db.collection('projects').add({ data: doc });
  await writeActivityLog({ projectId: result._id, operatorId: openid, action: 'project.created', targetType: 'project', targetId: result._id, targetTitleSnapshot: doc.title, after: parsed.data, visibleTo: [openid] });
  return success({ project: { ...doc, _id: result._id } }, '事件已创建');
}

async function get(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt) return fail('NOT_FOUND', '事件不存在或无权访问');
  return success({ project });
}

async function list(payload, context) {
  const openid = auth.getUserId(context); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const filter = { ownerId: openid, deletedAt: null };
  if (payload.status) filter.status = payload.status;
  if (payload.timeMode) filter.timeMode = payload.timeMode;
  const res = await db.collection('projects').where(filter).orderBy('updatedAt', 'desc').limit(100).get();
  return success({ projects: res.data });
}

async function update(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt) return fail('NOT_FOUND', '事件不存在或无权修改');
  const parsed = cleanProjectInput({ ...project, ...payload }); if (parsed.error) return fail('INVALID_PARAMS', parsed.error);
  await db.collection('projects').doc(project._id).update({ data: { ...parsed.data, updatedAt: db.serverDate() } });
  await writeActivityLog({ projectId: project._id, operatorId: openid, action: 'project.updated', targetType: 'project', targetId: project._id, targetTitleSnapshot: parsed.data.title, before: { title: project.title, timeMode: project.timeMode }, after: parsed.data, visibleTo: [openid] });
  return success(null, '事件已更新');
}

async function archive(payload, context) { return changeStatus(payload, context, PROJECT_STATUS.ARCHIVED, 'project.archived', '事件已归档'); }
async function restoreFromArchive(payload, context) { return changeStatus(payload, context, PROJECT_STATUS.ACTIVE, 'project.restored', '事件已恢复'); }
async function changeStatus(payload, context, status, action, message) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt || !permission.canManageProject(openid, project)) return fail('NOT_FOUND', '事件不存在或无权操作');
  await db.collection('projects').doc(project._id).update({ data: { status, updatedAt: db.serverDate() } });
  await writeActivityLog({ projectId: project._id, operatorId: openid, action, targetType: 'project', targetId: project._id, targetTitleSnapshot: project.title, before: { status: project.status }, after: { status }, visibleTo: [openid] });
  return success(null, message);
}

async function softDelete(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt) return fail('NOT_FOUND', '事件不存在或无权删除');
  await db.collection('projects').doc(project._id).update({ data: { deletedAt: db.serverDate(), updatedAt: db.serverDate() } });
  await writeActivityLog({ projectId: project._id, operatorId: openid, action: 'project.deleted', targetType: 'project', targetId: project._id, targetTitleSnapshot: project.title, visibleTo: [openid] });
  return success(null, '事件已移入回收站');
}

async function restore(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || !project.deletedAt) return fail('NOT_FOUND', '回收站中未找到该事件');
  await db.collection('projects').doc(project._id).update({ data: { deletedAt: null, updatedAt: db.serverDate() } });
  await writeActivityLog({ projectId: project._id, operatorId: openid, action: 'project.restored', targetType: 'project', targetId: project._id, targetTitleSnapshot: project.title, visibleTo: [openid] });
  return success(null, '事件已恢复');
}

async function recalculateProgress(projectId, openid) {
  const valid = { projectId, deletedAt: null, status: _.nin(['cancelled', 'closed_by_parent']) };
  const tasks = await db.collection('tasks').where(valid).get();
  const total = tasks.data.length;
  const completed = tasks.data.filter(item => item.status === 'completed' || item.status === 'approved').length;
  const progress = total ? Math.round(completed * 100 / total) : 0;
  await db.collection('projects').doc(projectId).update({ data: { taskCountCache: total, completedTaskCountCache: completed, progressCache: progress, updatedAt: db.serverDate() } });
  return { taskCount: total, completedTaskCount: completed, progress };
}

async function recalculateProgressAction(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid); if (!project) return fail('NOT_FOUND', '事件不存在或无权访问');
  return success({ progress: await recalculateProgress(project._id, openid) });
}

module.exports = { create, get, list, update, archive, restoreFromArchive, softDelete, restore, recalculateProgress: recalculateProgressAction, recalculateProjectProgress: recalculateProgress };
