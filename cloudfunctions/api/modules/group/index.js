const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const auth = require('../../common/auth');
const permission = require('../../common/permission');
const { success, fail } = require('../../common/response');
const { validateGroupName, validateObjectId } = require('../../common/validator');
const { writeActivityLog } = require('../../common/logger');
const { recalculateProjectProgress } = require('../project/index');

async function projectFor(openid, projectId) {
  const res = await db.collection('projects').doc(projectId).get().catch(() => ({ data: null }));
  return res.data && !res.data.deletedAt && permission.canManageProject(openid, res.data) ? res.data : null;
}
function groupInput(payload) {
  const name = validateGroupName(payload.name);
  if (!name.valid) return { error: name.message };
  const colors = ['#FF6B35', '#F04A4A', '#F6B90A', '#22B573', '#4E8DF5'];
  const icons = ['folder', 'flag', 'bookmark', 'circle'];
  return { data: { name: name.value, color: colors.includes(payload.color) ? payload.color : '#FF6B35', icon: icons.includes(payload.icon) ? payload.icon : 'folder' } };
}
async function list(payload, context) {
  const openid = auth.getUserId(context); const id = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const project = await projectFor(openid, id.value); if (!project) return fail('PROJECT_NOT_FOUND', '事件不存在或无权访问');
  const res = await db.collection('project_groups').where({ projectId: project._id, deletedAt: null }).orderBy('sortOrder', 'asc').get();
  return success({ groups: res.data });
}
async function create(payload, context) {
  const openid = auth.getUserId(context); const id = validateObjectId(payload.projectId); const parsed = groupInput(payload);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid || parsed.error) return fail('INVALID_PARAMS', id.valid ? parsed.error : id.message);
  const project = await projectFor(openid, id.value); if (!project) return fail('PROJECT_NOT_FOUND', '事件不存在或无权操作');
  const last = await db.collection('project_groups').where({ projectId: project._id, deletedAt: null }).orderBy('sortOrder', 'desc').limit(1).get();
  const sortOrder = last.data.length ? last.data[0].sortOrder + 1000 : 1000;
  const doc = { ...parsed.data, projectId: project._id, ownerId: openid, sortOrder, deletedAt: null, createdAt: db.serverDate(), updatedAt: db.serverDate() };
  const result = await db.collection('project_groups').add({ data: doc });
  await writeActivityLog({ projectId: project._id, groupId: result._id, operatorId: openid, action: 'group.created', targetType: 'group', targetId: result._id, targetTitleSnapshot: doc.name, after: doc, visibleTo: [openid] });
  return success({ group: { ...doc, _id: result._id } }, '分组已创建');
}
async function update(payload, context) {
  const openid = auth.getUserId(context); const id = validateObjectId(payload.groupId); const parsed = groupInput(payload);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid || parsed.error) return fail('INVALID_PARAMS', id.valid ? parsed.error : id.message);
  const res = await db.collection('project_groups').doc(id.value).get().catch(() => ({ data: null })); const group = res.data;
  if (!group || group.deletedAt) return fail('GROUP_NOT_FOUND', '分组不存在');
  const project = await projectFor(openid, group.projectId); if (!project) return fail('FORBIDDEN', '无权操作该分组');
  await db.collection('project_groups').doc(group._id).update({ data: { ...parsed.data, updatedAt: db.serverDate() } });
  await writeActivityLog({ projectId: project._id, groupId: group._id, operatorId: openid, action: 'group.updated', targetType: 'group', targetId: group._id, targetTitleSnapshot: parsed.data.name, before: { name: group.name, color: group.color, icon: group.icon }, after: parsed.data, visibleTo: [openid] });
  return success(null, '分组已更新');
}
async function remove(payload, context) {
  const openid = auth.getUserId(context); const id = validateObjectId(payload.groupId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const res = await db.collection('project_groups').doc(id.value).get().catch(() => ({ data: null })); const group = res.data;
  if (!group || group.deletedAt) return fail('GROUP_NOT_FOUND', '分组不存在');
  const project = await projectFor(openid, group.projectId); if (!project) return fail('FORBIDDEN', '无权操作该分组');
  await db.collection('tasks').where({ projectId: project._id, groupId: group._id, deletedAt: null }).update({ data: { groupId: null, updatedAt: db.serverDate() } });
  await db.collection('project_groups').doc(group._id).update({ data: { deletedAt: db.serverDate(), updatedAt: db.serverDate() } });
  await recalculateProjectProgress(project._id, openid);
  await writeActivityLog({ projectId: project._id, groupId: group._id, operatorId: openid, action: 'group.deleted', targetType: 'group', targetId: group._id, targetTitleSnapshot: group.name, before: { deletedAt: null }, after: { deletedAt: 'serverDate', taskGroupId: null }, visibleTo: [openid] });
  return success(null, '分组已删除，任务已移至未分组');
}
async function reorder(payload, context) {
  const openid = auth.getUserId(context); const id = validateObjectId(payload.projectId); const groupIds = Array.isArray(payload.groupIds) ? payload.groupIds : [];
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const project = await projectFor(openid, id.value); if (!project) return fail('PROJECT_NOT_FOUND', '事件不存在或无权操作');
  const current = await db.collection('project_groups').where({ projectId: project._id, deletedAt: null }).get();
  const validIds = current.data.map(item => item._id).sort();
  const requestedIds = [...new Set(groupIds)].sort();
  if (!groupIds.length || validIds.length !== requestedIds.length || validIds.some((value, index) => value !== requestedIds[index])) {
    return fail('INVALID_REORDER', '分组排序数据无效，请刷新后重试');
  }
  await Promise.all(groupIds.map((groupId, index) => db.collection('project_groups').doc(groupId).update({ data: { sortOrder: (index + 1) * 1000, updatedAt: db.serverDate() } })));
  await writeActivityLog({ projectId: project._id, groupId: groupIds[0], operatorId: openid, action: 'group.reordered', targetType: 'group', targetTitleSnapshot: '分组排序', after: { groupIds }, visibleTo: [openid] });
  return success(null, '分组排序已保存');
}
module.exports = { list, create, update, delete: remove, reorder };
