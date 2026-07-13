/**
 * 事件树 - 大事件服务
 */
const { callApi } = require('./api');

function create(data) { return callApi('project', 'create', data); }
function update(projectId, data) { return callApi('project', 'update', { projectId, ...data }); }
function get(projectId) { return callApi('project', 'get', { projectId }); }
function list(params) { return callApi('project', 'list', params); }
function listDeleted() { return callApi('project', 'listDeleted'); }
function archive(projectId) { return callApi('project', 'archive', { projectId }); }
function restoreFromArchive(projectId) { return callApi('project', 'restoreFromArchive', { projectId }); }
function softDelete(projectId) { return callApi('project', 'softDelete', { projectId }); }
function restore(projectId) { return callApi('project', 'restore', { projectId }); }
function recalculateProgress(projectId) { return callApi('project', 'recalculateProgress', { projectId }); }

function complete(projectId, confirmEarly = false) { return callApi('project', 'complete', { projectId, confirmEarly }); }
function reopen(projectId) { return callApi('project', 'reopen', { projectId }); }

module.exports = {
  create, update, get, list, listDeleted,
  archive, restoreFromArchive, softDelete, restore,
  recalculateProgress, complete, reopen
};
