/**
 * 事件树 - 大事件服务
 */
const { callApi } = require('./api');

function create(data) { return callApi('project', 'create', data); }
function update(projectId, data) { return callApi('project', 'update', { projectId, ...data }); }
function get(projectId) { return callApi('project', 'get', { projectId }); }
function list(params) { return callApi('project', 'list', params); }
function complete(projectId) { return callApi('project', 'complete', { projectId }); }
function reopen(projectId) { return callApi('project', 'reopen', { projectId }); }
function archive(projectId) { return callApi('project', 'archive', { projectId }); }
function restoreFromArchive(projectId) { return callApi('project', 'restoreFromArchive', { projectId }); }
function softDelete(projectId) { return callApi('project', 'softDelete', { projectId }); }
function restore(projectId) { return callApi('project', 'restore', { projectId }); }
function hardDelete(projectId) { return callApi('project', 'hardDelete', { projectId }); }
function getDashboardStats() { return callApi('project', 'getDashboardStats'); }

module.exports = {
  create, update, get, list, complete, reopen,
  archive, restoreFromArchive, softDelete, restore, hardDelete,
  getDashboardStats
};
