/**
 * 事件树 - 前端校验工具
 * 后端校验是安全底线，前端校验提升体验
 */

const { LIMITS, PRIORITY, TIME_MODE, SCHEDULE_TYPE } = require('../constants/enums');

function validateProjectTitle(title) {
  if (!title || typeof title !== 'string') return '请输入事件名称';
  const t = title.trim();
  if (t.length < LIMITS.PROJECT_TITLE_MIN) return '事件名称不能为空';
  if (t.length > LIMITS.PROJECT_TITLE_MAX) return '事件名称不能超过40字';
  return '';
}

function validateTaskTitle(title) {
  if (!title || typeof title !== 'string') return '请输入任务名称';
  const t = title.trim();
  if (t.length < 1) return '任务名称不能为空';
  if (t.length > LIMITS.TASK_TITLE_MAX) return '任务名称不能超过60字';
  return '';
}

function validateNote(note) {
  if (!note) return '';
  if (note.length > LIMITS.TASK_NOTE_MAX) return '备注不能超过500字';
  return '';
}

function validateProjectDesc(desc) {
  if (!desc) return '';
  if (desc.length > LIMITS.PROJECT_DESC_MAX) return '说明不能超过1000字';
  return '';
}

function validateGroupName(name) {
  if (!name || typeof name !== 'string') return '请输入分组名称';
  const n = name.trim();
  if (n.length < LIMITS.GROUP_NAME_MIN) return '分组名称不能为空';
  if (n.length > LIMITS.GROUP_NAME_MAX) return '分组名称不能超过20字';
  return '';
}

function validateTimeRange(startAt, endAt, timeMode) {
  if (timeMode === TIME_MODE.NONE) return '';
  if (timeMode === TIME_MODE.ONGOING) {
    if (!startAt) return '请设置开始日期';
    return '';
  }
  if (timeMode === TIME_MODE.RANGE) {
    if (!startAt || !endAt) return '请设置起止日期';
    if (new Date(endAt) < new Date(startAt)) return '结束日期不能早于开始日期';
    return '';
  }
  return '';
}

function validateTaskTime(startAt, endAt, dueAt, scheduleType) {
  if (scheduleType === SCHEDULE_TYPE.NONE) return '';
  if (scheduleType === SCHEDULE_TYPE.DEADLINE) {
    if (!dueAt) return '请设置截止时间';
    return '';
  }
  if (scheduleType === SCHEDULE_TYPE.RANGE) {
    if (!startAt || !endAt) return '请设置起止时间';
    if (new Date(endAt) < new Date(startAt)) return '结束时间不能早于开始时间';
    return '';
  }
  return '';
}

function validatePriority(p) {
  const valid = Object.values(PRIORITY);
  return valid.includes(p) ? '' : '优先级无效';
}

module.exports = {
  validateProjectTitle,
  validateTaskTitle,
  validateNote,
  validateProjectDesc,
  validateGroupName,
  validateTimeRange,
  validateTaskTime,
  validatePriority
};
