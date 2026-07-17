/**
 * 事件树 - 项目进度计算公共模块
 * 所有进度计算统一经过此模块，避免跨模块循环依赖
 */

const cloud = require('wx-server-sdk');
const _ = cloud.database().command;
const { getAll } = require('./query');
const { allBranchesCompleted } = require('./project-state');

let _db = null;
function getDb() {
  if (!_db) {
    if (!cloud.getWXContext) cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    _db = cloud.database();
  }
  return _db;
}

/**
 * 重新计算并更新项目进度缓存
 * 排除：已软删除、cancelled
 * closed_by_parent 保留在总数中，但不计为完成，避免提前结束后显示虚假 100%
 * 完成包括：completed、approved
 * @param {string} projectId - 项目 ID
 * @returns {Promise<{taskCount: number, completedTaskCount: number, progress: number}>}
 */
async function recalculateProjectProgress(projectId) {
  const db = getDb();
  const valid = {
    projectId: projectId,
    deletedAt: _.eq(null),
    status: _.nin(['cancelled'])
  };

  const tasks = await getAll(db.collection('tasks').where(valid));
  const total = tasks.length;
  const completed = tasks.filter(item => item.status === 'completed' || item.status === 'approved').length;
  const progress = total ? Math.round(completed * 100 / total) : 0;

  const updateData = {
    taskCountCache: total,
    completedTaskCountCache: completed,
    progressCache: progress,
    updatedAt: db.serverDate()
  };

  await db.collection('projects').doc(projectId).update({ data: updateData });

  return {
    taskCount: total,
    completedTaskCount: completed,
    progress,
    allBranchesCompleted: allBranchesCompleted(total, completed)
  };
}

module.exports = { recalculateProjectProgress };
