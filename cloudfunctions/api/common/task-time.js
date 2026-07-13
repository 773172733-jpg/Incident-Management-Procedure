function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEffectiveDueAt(task) {
  return toValidDate(task && (task.dueAt || task.endAt));
}

function isTaskOverdue(task, now = new Date()) {
  if (!task || task.deletedAt || task.status === 'completed' || task.status === 'approved' || task.status === 'closed_by_parent') return false;
  const dueAt = getEffectiveDueAt(task);
  return Boolean(dueAt && dueAt.getTime() < now.getTime());
}

function normalizeTaskTimePayload(scheduleType, payload) {
  if (scheduleType === 'none') return { data: { startAt: null, dueAt: null, endAt: null } };
  const dueAt = toValidDate(payload.dueAt || (scheduleType === 'range' ? payload.endAt : null));
  if (scheduleType === 'deadline') {
    return dueAt
      ? { data: { startAt: null, dueAt, endAt: null } }
      : { error: '请设置有效的截止时间' };
  }
  const startAt = toValidDate(payload.startAt);
  if (!startAt || !dueAt || dueAt < startAt) return { error: '请正确设置起止时间' };
  return { data: { startAt, dueAt, endAt: null } };
}

module.exports = { toValidDate, getEffectiveDueAt, isTaskOverdue, normalizeTaskTimePayload };
