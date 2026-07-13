const { getEffectiveDueAt } = require('./task-time');
const { REMINDER_MODE, REMINDER_STATUS } = require('./constants');

const CHANNEL = 'in_app';
const MAX_OFFSET_MINUTES = 43200;
const ACTIVE_STATUSES = [REMINDER_STATUS.PENDING, REMINDER_STATUS.PROCESSING, REMINDER_STATUS.TRIGGERED];

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeReminderConfig(source = {}, fallback = {}) {
  const rawMode = source.mode !== undefined ? source.mode
    : source.reminderMode !== undefined ? source.reminderMode
      : fallback.reminderMode || REMINDER_MODE.NONE;
  if (!Object.values(REMINDER_MODE).includes(rawMode)) return { error: '提醒模式无效' };
  if (rawMode === REMINDER_MODE.NONE || rawMode === REMINDER_MODE.AT_DUE) {
    return { data: { reminderMode: rawMode, reminderOffsetMinutes: null, reminderCustomAt: null } };
  }
  if (rawMode === REMINDER_MODE.OFFSET) {
    const rawOffset = source.offsetMinutes !== undefined ? source.offsetMinutes
      : source.reminderOffsetMinutes !== undefined ? source.reminderOffsetMinutes
        : fallback.reminderOffsetMinutes;
    const offset = Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 1 || offset > MAX_OFFSET_MINUTES) return { error: '提醒提前时间无效' };
    return { data: { reminderMode: rawMode, reminderOffsetMinutes: offset, reminderCustomAt: null } };
  }
  const rawCustom = source.customAt !== undefined ? source.customAt
    : source.reminderCustomAt !== undefined ? source.reminderCustomAt
      : fallback.reminderCustomAt;
  const customAt = validDate(rawCustom);
  if (!customAt) return { error: '自定义提醒时间无效' };
  return { data: { reminderMode: rawMode, reminderOffsetMinutes: null, reminderCustomAt: customAt } };
}

function calculateScheduledAt(config, dueValue, nowValue = new Date()) {
  const dueAt = validDate(dueValue);
  const now = validDate(nowValue) || new Date();
  if (config.reminderMode === REMINDER_MODE.NONE) return { cancelled: true, dueAt };
  if (!dueAt) return { error: '任务没有有效截止时间' };
  let scheduledAt;
  if (config.reminderMode === REMINDER_MODE.AT_DUE) scheduledAt = new Date(dueAt);
  else if (config.reminderMode === REMINDER_MODE.OFFSET) scheduledAt = new Date(dueAt.getTime() - config.reminderOffsetMinutes * 60000);
  else scheduledAt = validDate(config.reminderCustomAt);
  if (!scheduledAt) return { error: '提醒时间无效' };
  if (scheduledAt > dueAt) return { error: '提醒时间不能晚于截止时间' };
  return { dueAt, scheduledAt, expired: scheduledAt < now };
}

function taskCanBeReminded(task, project) {
  return Boolean(task && project && !task.deletedAt && !project.deletedAt
    && (task.scheduleType === 'deadline' || task.scheduleType === 'range')
    && getEffectiveDueAt(task)
    && !['completed', 'approved', 'closed_by_parent', 'cancelled'].includes(task.status));
}

function dedupeKey(ownerId, taskId) { return `${ownerId}:${taskId}:${CHANNEL}`; }

async function findReminder(db, ownerId, taskId) {
  const result = await db.collection('reminders').where({ ownerId, taskId, channel: CHANNEL }).limit(10).get();
  return result.data || [];
}

async function cancelTaskReminder(db, ownerId, taskId, options = {}) {
  if (!ownerId || !taskId) return { cancelled: 0 };
  const statuses = options.includeTriggered === false
    ? [REMINDER_STATUS.PENDING, REMINDER_STATUS.PROCESSING]
    : ACTIVE_STATUSES;
  const result = await db.collection('reminders').where({ ownerId, taskId, channel: CHANNEL, status: db.command.in(statuses) }).update({
    data: { status: REMINDER_STATUS.CANCELLED, cancelledAt: db.serverDate(), updatedAt: db.serverDate() }
  });
  return { cancelled: result.stats ? result.stats.updated : 0 };
}

async function syncTaskReminder(db, task, project, now = new Date()) {
  const ownerId = task && task.ownerId;
  const taskId = task && task._id;
  if (!ownerId || !taskId) return { warning: '提醒缺少任务身份信息' };
  if (!taskCanBeReminded(task, project)) {
    await cancelTaskReminder(db, ownerId, taskId);
    return { cancelled: true };
  }
  const parsed = normalizeReminderConfig(task);
  if (parsed.error) {
    await cancelTaskReminder(db, ownerId, taskId);
    return { warning: parsed.error };
  }
  const schedule = calculateScheduledAt(parsed.data, getEffectiveDueAt(task), now);
  if (schedule.error || schedule.cancelled || schedule.expired) {
    await cancelTaskReminder(db, ownerId, taskId);
    return { cancelled: true, expired: !!schedule.expired, warning: schedule.error || (schedule.expired ? '提醒时间已过，不会创建提醒' : '') };
  }

  const key = dedupeKey(ownerId, taskId);
  const rows = await findReminder(db, ownerId, taskId);
  const primary = rows.find(item => item.dedupeKey === key) || rows[0];
  const data = {
    ownerId, projectId: project._id, taskId, channel: CHANNEL,
    reminderMode: parsed.data.reminderMode,
    offsetMinutes: parsed.data.reminderOffsetMinutes,
    dueAt: schedule.dueAt, scheduledAt: schedule.scheduledAt,
    status: REMINDER_STATUS.PENDING, dedupeKey: key,
    retryCount: 0, maxRetries: 3, nextRetryAt: null, processingAt: null,
    triggeredAt: null, readAt: null, cancelledAt: null, failedAt: null, lastError: '',
    taskTitleSnapshot: task.title || '', projectTitleSnapshot: project.title || '',
    updatedAt: db.serverDate()
  };
  if (primary) await db.collection('reminders').doc(primary._id).update({ data });
  else {
    try { await db.collection('reminders').add({ data: { ...data, createdAt: db.serverDate() } }); }
    catch (error) {
      const concurrent = (await findReminder(db, ownerId, taskId))[0];
      if (!concurrent) throw error;
      await db.collection('reminders').doc(concurrent._id).update({ data });
    }
  }
  const extras = rows.filter(item => !primary || item._id !== primary._id);
  await Promise.all(extras.map(item => db.collection('reminders').doc(item._id).update({ data: {
    status: REMINDER_STATUS.CANCELLED, cancelledAt: db.serverDate(), updatedAt: db.serverDate()
  } })));
  return { scheduled: true, scheduledAt: schedule.scheduledAt };
}

module.exports = {
  CHANNEL, MAX_OFFSET_MINUTES, normalizeReminderConfig, calculateScheduledAt,
  taskCanBeReminded, dedupeKey, findReminder, cancelTaskReminder, syncTaskReminder
};
