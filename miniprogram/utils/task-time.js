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

module.exports = { toValidDate, getEffectiveDueAt, isTaskOverdue };
