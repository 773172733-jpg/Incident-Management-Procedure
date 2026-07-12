/**
 * 事件树 - 日期工具
 */

/** 日期格式化为 YYYY.MM.DD */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '.' + m + '.' + day;
}

/** 日期格式化为 HH:MM */
function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** 日期格式化为 YYYY.MM.DD HH:MM */
function formatDateTime(date) {
  if (!date) return '';
  return formatDate(date) + ' ' + formatTime(date);
}

/** 相对时间描述 */
function relativeTime(date) {
  if (!date) return '';
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return minutes + '分钟前';
  if (hours < 24) return hours + '小时前';
  if (days < 7) return days + '天前';
  return formatDate(date);
}

/** 持续天数 */
function durationDays(startAt, endAt) {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : new Date();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

/** 剩余天数 */
function remainingDays(endAt) {
  if (!endAt) return null;
  const diff = new Date(endAt).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

/** 判断是否逾期 */
function isOverdue(endAt) {
  if (!endAt) return false;
  return new Date(endAt).getTime() < Date.now();
}

/** 获取当天 0 点 */
function startOfDay(date) {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 获取当天 23:59:59 */
function endOfDay(date) {
  const d = date ? new Date(date) : new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** 生成 ISO 日期字符串 */
function toISO(date) {
  if (!date) return null;
  return new Date(date).toISOString();
}

module.exports = {
  formatDate,
  formatTime,
  formatDateTime,
  relativeTime,
  durationDays,
  remainingDays,
  isOverdue,
  startOfDay,
  endOfDay,
  toISO
};