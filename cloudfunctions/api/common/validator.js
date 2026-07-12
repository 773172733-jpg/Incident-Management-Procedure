/**
 * 事件树 - 后端参数校验
 * 严格校验所有用户输入，不能信任前端传来的任何值
 */

const { LIMITS, PRIORITY, TIME_MODE, SCHEDULE_TYPE } = require('./constants');

function trimAndCheck(str, maxLen) {
  if (typeof str !== 'string') return { valid: false, message: '参数类型错误' };
  const trimmed = str.trim();
  if (trimmed.length === 0) return { valid: false, message: '不能为空' };
  if (trimmed.length > maxLen) return { valid: false, message: `不能超过 ${maxLen} 个字` };
  return { valid: true, value: trimmed };
}

function validateProjectTitle(title) {
  const r = trimAndCheck(title, LIMITS.PROJECT_TITLE_MAX);
  if (!r.valid) return { valid: false, message: r.message || '事件名称无效' };
  if (r.value.length < LIMITS.PROJECT_TITLE_MIN) return { valid: false, message: '事件名称不能为空' };
  return r;
}

function validateTaskTitle(title) {
  const r = trimAndCheck(title, LIMITS.TASK_TITLE_MAX);
  if (!r.valid) return { valid: false, message: r.message || '任务名称无效' };
  if (r.value.length < 1) return { valid: false, message: '任务名称不能为空' };
  return r;
}

function validateGroupName(name) {
  const r = trimAndCheck(name, LIMITS.GROUP_NAME_MAX);
  if (!r.valid) return { valid: false, message: r.message || '分组名称无效' };
  if (r.value.length < LIMITS.GROUP_NAME_MIN) return { valid: false, message: '分组名称不能为空' };
  return r;
}

function validatePriority(p) {
  const valid = Object.values(PRIORITY);
  if (!valid.includes(p)) return { valid: false, message: '优先级参数无效' };
  return { valid: true, value: p };
}

function validateTimeMode(m) {
  const valid = Object.values(TIME_MODE);
  if (!valid.includes(m)) return { valid: false, message: '时间模式参数无效' };
  return { valid: true, value: m };
}

function validateScheduleType(s) {
  const valid = Object.values(SCHEDULE_TYPE);
  if (!valid.includes(s)) return { valid: false, message: '时间类型参数无效' };
  return { valid: true, value: s };
}

function validateProjectStatus(s) {
  const valid = ['active', 'completed', 'archived', 'cancelled'];
  if (!valid.includes(s)) return { valid: false, message: '状态参数无效' };
  return { valid: true, value: s };
}

function validateObjectId(id) {
  if (!id || typeof id !== 'string') return { valid: false, message: 'ID 无效' };
  return { valid: true, value: id };
}

module.exports = {
  validateProjectTitle, validateTaskTitle, validateGroupName,
  validatePriority, validateTimeMode, validateScheduleType,
  validateProjectStatus, validateObjectId
};
