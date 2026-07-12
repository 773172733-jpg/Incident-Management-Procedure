/**
 * 事件树 - 分支任务服务
 */
const { callApi } = require('./api');

function create(data) { return callApi('task', 'create', data); }
function update(taskId, data) { return callApi('task', 'update', { taskId, ...data }); }
function get(taskId) { return callApi('task', 'get', { taskId }); }
function listByProject(projectId, params) { return callApi('task', 'listByProject', { projectId, ...params }); }
function complete(taskId) { return callApi('task', 'complete', { taskId }); }
function reopen(taskId) { return callApi('task', 'reopen', { taskId }); }
function softDelete(taskId) { return callApi('task', 'softDelete', { taskId }); }
function restore(taskId) { return callApi('task', 'restore', { taskId }); }
function hardDelete(taskId) { return callApi('task', 'hardDelete', { taskId }); }
function reorder(projectId, taskIds) { return callApi('task', 'reorder', { projectId, taskIds }); }
function batchMoveGroup(projectId, taskIds, groupId) {
  return callApi('task', 'batchMoveGroup', { projectId, taskIds, groupId });
}

module.exports = {
  create, update, get, listByProject, complete, reopen,
  softDelete, restore, hardDelete, reorder, batchMoveGroup
};
