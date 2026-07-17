/**
 * 事件树 - 格式化工具
 */

const { PRIORITY } = require('../constants/enums');
const { getEffectiveDueAt } = require('./task-time');

/** 优先级显示文案 */
function priorityLabel(p) {
  const map = {
    core: '核心',
    important: '重要',
    optional: '可选'
  };
  return map[p] || '';
}

/** 进度百分比文本 */
function progressText(completed, total) {
  if (total === 0) return '0%';
  return Math.round((completed / total) * 100) + '%';
}

/** 大事件时间文案 */
function projectTimeText(project) {
  const { timeMode, startAt, endAt } = project;
  const date = require('./date');

  if (timeMode === 'none') return '未设置时间';
  if (timeMode === 'ongoing') {
    const days = date.durationDays(startAt);
    return '持续进行 \u00B7 已持续 ' + days + ' 天';
  }
  if (timeMode === 'range') {
    const s = date.formatDate(startAt);
    const e = date.formatDate(endAt);
    return s + '\u2014' + e;
  }
  return '';
}

/** 任务时间文案 */
function taskTimeText(task) {
  const { scheduleType, startAt } = task;
  const dueAt = getEffectiveDueAt(task);
  const date = require('./date');

  if (scheduleType === 'none') return '';
  if (scheduleType === 'deadline') return '截止 ' + date.formatDateTime(dueAt);
  if (scheduleType === 'range') {
    return date.formatDate(startAt) + '\u2014' + date.formatDate(dueAt);
  }
  return '';
}

/** 状态文案 */
function statusLabel(status) {
  const map = {
    active: '进行中',
    completed: '已结束',
    archived: '已归档',
    cancelled: '已取消',
    todo: '未完成',
    doing: '进行中',
    closed_by_parent: '随备忘录结束'
  };
  return map[status] || status;
}

/** 完成者角色 */
function completedRoleLabel(sourceType) {
  return '已完成';
}

module.exports = {
  priorityLabel,
  progressText,
  projectTimeText,
  taskTimeText,
  statusLabel,
  completedRoleLabel
};
