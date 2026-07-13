const { callApi } = require('./api');

function getByTask(taskId) { return callApi('reminder', 'getByTask', { taskId }); }
function upsert(taskId, config) { return callApi('reminder', 'upsert', { taskId, ...config }); }
function cancel(taskId) { return callApi('reminder', 'cancel', { taskId }); }
function getWechatSubscriptionByTask(taskId) { return callApi('reminder', 'getWechatSubscriptionByTask', { taskId }); }
function upsertWechatSubscription(taskId, data) { return callApi('reminder', 'upsertWechatSubscription', { taskId, ...data }); }
function cancelWechatSubscription(taskId) { return callApi('reminder', 'cancelWechatSubscription', { taskId }); }
function listUnread() { return callApi('reminder', 'listUnread'); }
function markRead(reminderId) { return callApi('reminder', 'markRead', { reminderId }); }
function markAllRead() { return callApi('reminder', 'markAllRead'); }

module.exports = {
  getByTask, upsert, cancel,
  getWechatSubscriptionByTask, upsertWechatSubscription, cancelWechatSubscription,
  listUnread, markRead, markAllRead
};
