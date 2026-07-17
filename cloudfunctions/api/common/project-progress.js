/**
 * 事件树 - 项目进度计算公共模块
 * 所有进度计算统一经过此模块，避免跨模块循环依赖
 */

const cloud = require('wx-server-sdk');
const { getAll } = require('./query');
const {
  summarizeProjectTasks,
  withProjectCompletionState
} = require('./project-state');

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
  const _ = db.command;
  const valid = {
    projectId: projectId,
    deletedAt: _.eq(null),
    status: _.nin(['cancelled'])
  };

  const tasks = await getAll(db.collection('tasks').where(valid));
  const summary = summarizeProjectTasks(tasks);

  const updateData = {
    taskCountCache: summary.taskCount,
    completedTaskCountCache: summary.completedTaskCount,
    progressCache: summary.progress,
    updatedAt: db.serverDate()
  };

  await db.collection('projects').doc(projectId).update({ data: updateData });

  return {
    taskCount: summary.taskCount,
    completedTaskCount: summary.completedTaskCount,
    progress: summary.progress,
    allBranchesCompleted: summary.allBranchesCompleted
  };
}

async function loadProjectProgressStats(db, ownerId, projects) {
  const projectIds = new Set((Array.isArray(projects) ? projects : [])
    .map(project => project && project._id)
    .filter(Boolean));
  if (!projectIds.size) return [];

  const tasks = await getAll(db.collection('tasks').where({
    ownerId,
    deletedAt: db.command.eq(null)
  }).field({
    projectId: true,
    status: true,
    deletedAt: true
  }));
  const grouped = new Map();
  tasks.forEach(task => {
    if (!projectIds.has(task.projectId)) return;
    if (!grouped.has(task.projectId)) grouped.set(task.projectId, []);
    grouped.get(task.projectId).push(task);
  });

  return projects.map(project => withProjectCompletionState(
    project,
    summarizeProjectTasks(grouped.get(project._id) || [])
  ));
}

module.exports = {
  recalculateProjectProgress,
  loadProjectProgressStats
};
