/**
 * 事件树 - 活动日志服务
 */
const { callApi } = require('./api');

function list(params) { return callApi('activity', 'list', params); }
function listByProject(projectId, params) {
  return callApi('activity', 'listByProject', { projectId, ...params });
}

module.exports = { list, listByProject };
