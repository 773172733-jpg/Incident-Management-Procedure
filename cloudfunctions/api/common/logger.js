/**
 * 事件树 - 活动日志写入器
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 写入活动日志
 * @param {object} params
 */
async function writeActivityLog(params) {
  const {
    projectId, taskId = null, groupId = null, teamId = null,
    operatorId, actorNameSnapshot = '',
    action, targetType, targetId = '', targetTitleSnapshot = '',
    before = {}, after = {}, metadata = {},
    visibleTo = []
  } = params;

  try {
    return await db.collection('activity_logs').add({
      data: {
        projectId,
        taskId,
        groupId,
        teamId,
        operatorId,
        actorNameSnapshot,
        action,
        targetType,
        targetId,
        targetTitleSnapshot,
        before,
        after,
        metadata,
        visibleTo,
        createdAt: db.serverDate()
      }
    });
  } catch (err) {
    console.error('[logger] write failed:', err);
    // 日志写入失败不应影响主流程
    return null;
  }
}

module.exports = { writeActivityLog };
