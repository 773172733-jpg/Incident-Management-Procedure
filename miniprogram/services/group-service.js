const { callApi } = require('./api');
const list = projectId => callApi('group', 'list', { projectId });
const create = data => callApi('group', 'create', data);
const update = (groupId, data) => callApi('group', 'update', { groupId, ...data });
const remove = groupId => callApi('group', 'delete', { groupId });
const reorder = (projectId, groupIds) => callApi('group', 'reorder', { projectId, groupIds });
module.exports = { list, create, update, remove, reorder };
