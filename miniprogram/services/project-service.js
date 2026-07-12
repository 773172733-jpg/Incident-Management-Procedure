/**
 * 事件树 - 大事件服务
 */
const { callApi } = require('./api');

function create(data) { return callApi('project', 'create', data); }
function update(projectId, data) { return callApi('project', 'update', { projectId, ...data }); }
function get(projectId) { return callApi('project', 'get', { projectId }); }
function list(params) { return callApi('project', 'list', params); }
function archive(projectId) { return callApi('project', 'archive', { projectId }); }
function restoreFromArchive(projectId) { return callApi('project', 'restoreFromArchive', { projectId }); }
function softDelete(projectId) { return callApi('project', 'softDelete', { projectId }); }
function restore(projectId) { return callApi('project', 'restore', { projectId }); }
function recalculateProgress(projectId) { return callApi('project', 'recalculateProgress', { projectId }); }

module.exports = {
  create, update, get, list,
  archive, restoreFromArchive, softDelete, restore,
  recalculateProgress
};
