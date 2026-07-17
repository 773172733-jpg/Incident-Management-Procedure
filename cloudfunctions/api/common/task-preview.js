'use strict';

const COMPLETED_STATUSES = new Set(['completed', 'approved']);
const PRIORITY_RANK = { core: 0, important: 1, optional: 2 };

function isCompletedTask(task) {
  return Boolean(task && COMPLETED_STATUSES.has(task.status));
}

function dateRank(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function comparePreviewTasks(left, right) {
  const completion = Number(isCompletedTask(left)) - Number(isCompletedTask(right));
  if (completion) return completion;

  const priority = (PRIORITY_RANK[left.priority] ?? 99) - (PRIORITY_RANK[right.priority] ?? 99);
  if (priority) return priority;

  const created = dateRank(left.createdAt) - dateRank(right.createdAt);
  if (created) return created;

  const sortOrder = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0);
  if (sortOrder) return sortOrder;

  return String(left._id || '').localeCompare(String(right._id || ''));
}

function buildTaskPreview(tasks, limit = 6) {
  const validTasks = (Array.isArray(tasks) ? tasks : []).filter(task => (
    task && !task.deletedAt && task.status !== 'cancelled'
  ));
  const safeLimit = Math.min(6, Math.max(1, Number(limit) || 6));
  const completedTaskCount = validTasks.filter(isCompletedTask).length;
  const totalTaskCount = validTasks.length;

  return {
    tasks: validTasks.slice().sort(comparePreviewTasks).slice(0, safeLimit),
    totalTaskCount,
    completedTaskCount,
    unfinishedTaskCount: totalTaskCount - completedTaskCount,
    hasMore: totalTaskCount > safeLimit
  };
}

module.exports = {
  buildTaskPreview,
  comparePreviewTasks,
  isCompletedTask
};
