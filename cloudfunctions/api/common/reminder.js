const { getEffectiveDueAt } = require('./task-time');
const { REMINDER_MODE, REMINDER_STATUS } = require('./constants');
const { WECHAT_SUBSCRIPTION_TEMPLATE, validTemplateId, priorityText } = require('./wechat-subscription');

const CHANNEL = 'in_app';
const CHANNELS = { IN_APP: 'in_app', WECHAT_SUBSCRIPTION: 'wechat_subscription' };
const MAX_OFFSET_MINUTES = 43200;
const ACTIVE_STATUSES = [REMINDER_STATUS.PENDING, REMINDER_STATUS.PROCESSING, REMINDER_STATUS.TRIGGERED];
const WECHAT_ACTIVE_STATUSES = [REMINDER_STATUS.PENDING, REMINDER_STATUS.PROCESSING, REMINDER_STATUS.FAILED];

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

function dedupeKey(ownerId, taskId, channel = CHANNEL) { return `${ownerId}:${taskId}:${channel}`; }

async function findReminder(db, ownerId, taskId, channel = CHANNEL) {
  const filter = { ownerId, taskId };
  if (channel) filter.channel = channel;
  const result = await db.collection('reminders').where(filter).limit(10).get();
  return result.data || [];
}

async function cancelTaskReminder(db, ownerId, taskId, options = {}) {
  if (!ownerId || !taskId) return { cancelled: 0 };
  const statuses = options.statuses || (options.includeTriggered === false
    ? [REMINDER_STATUS.PENDING, REMINDER_STATUS.PROCESSING]
    : ACTIVE_STATUSES.concat(REMINDER_STATUS.FAILED));
  const filter = { ownerId, taskId, status: db.command.in(statuses) };
  if (options.channel) filter.channel = options.channel;
  const result = await db.collection('reminders').where(filter).update({
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

  const key = dedupeKey(ownerId, taskId, CHANNELS.IN_APP);
  const rows = await findReminder(db, ownerId, taskId, CHANNELS.IN_APP);
  const primary = rows.find(item => item.dedupeKey === key) || rows[0];
  const data = {
    ownerId, projectId: project._id, taskId, channel: CHANNELS.IN_APP,
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

function truncateThing(value, max = 20) {
  const text = String(value || '').trim();
  if (!text) return '未命名';
  return text.length > max ? text.slice(0, max) : text;
}

function formatWechatTime(value) {
  const date = validDate(value);
  if (!date) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildWechatSendData(task, project, scheduledAt, dueAt) {
  const fields = WECHAT_SUBSCRIPTION_TEMPLATE.fields;
  return {
    [fields.taskTitle]: { value: truncateThing(task.title) },
    [fields.projectTitle]: { value: truncateThing(project.title) },
    [fields.dueAt]: { value: formatWechatTime(dueAt) },
    [fields.scheduledAt]: { value: formatWechatTime(scheduledAt) },
    [fields.priority]: { value: priorityText(task.priority) }
  };
}

function buildWechatPagePath(projectId, taskId) {
  return `/pages/project-detail/project-detail?id=${encodeURIComponent(projectId)}&taskId=${encodeURIComponent(taskId)}`;
}

async function syncWechatSubscription(db, task, project, options = {}, now = new Date()) {
  const ownerId = task && task.ownerId;
  const taskId = task && task._id;
  const templateId = options.templateId || WECHAT_SUBSCRIPTION_TEMPLATE.id;
  if (!ownerId || !taskId) return { warning: 'wechat reminder missing task identity' };
  if (!validTemplateId(templateId)) return { warning: 'wechat subscription template is not configured' };
  if (options.authorizationResult !== 'accept') return { skipped: true, reason: 'not_authorized' };
  if (!taskCanBeReminded(task, project)) {
    await cancelTaskReminder(db, ownerId, taskId, { channel: CHANNELS.WECHAT_SUBSCRIPTION, statuses: WECHAT_ACTIVE_STATUSES });
    return { cancelled: true };
  }
  const parsed = normalizeReminderConfig(task);
  if (parsed.error) {
    await cancelTaskReminder(db, ownerId, taskId, { channel: CHANNELS.WECHAT_SUBSCRIPTION, statuses: WECHAT_ACTIVE_STATUSES });
    return { warning: parsed.error };
  }
  const dueAt = getEffectiveDueAt(task);
  const schedule = calculateScheduledAt(parsed.data, dueAt, now);
  if (schedule.error || schedule.cancelled || schedule.expired) {
    await cancelTaskReminder(db, ownerId, taskId, { channel: CHANNELS.WECHAT_SUBSCRIPTION, statuses: WECHAT_ACTIVE_STATUSES });
    return { cancelled: true, expired: !!schedule.expired, warning: schedule.error || (schedule.expired ? 'wechat reminder time expired' : '') };
  }

  const key = dedupeKey(ownerId, taskId, CHANNELS.WECHAT_SUBSCRIPTION);
  const rows = await findReminder(db, ownerId, taskId, CHANNELS.WECHAT_SUBSCRIPTION);
  const primary = rows.find(item => item.dedupeKey === key) || rows[0];
  const data = {
    ownerId, projectId: project._id, taskId, channel: CHANNELS.WECHAT_SUBSCRIPTION,
    templateId, subscriptionStatus: 'accepted',
    authorizationSource: options.authorizationSource || 'task_edit',
    dueAt: schedule.dueAt, scheduledAt: schedule.scheduledAt,
    reminderMode: parsed.data.reminderMode,
    offsetMinutes: parsed.data.reminderOffsetMinutes,
    status: REMINDER_STATUS.PENDING, dedupeKey: key,
    pagePath: buildWechatPagePath(project._id, taskId),
    sendDataSnapshot: buildWechatSendData(task, project, schedule.scheduledAt, schedule.dueAt),
    retryCount: 0, maxRetries: 3, nextRetryAt: null, processingAt: null,
    triggeredAt: null, readAt: null, sentAt: null, cancelledAt: null, failedAt: null,
    authorizationAt: db.serverDate(), authorizationConsumedAt: null, lastError: '',
    taskTitleSnapshot: task.title || '', projectTitleSnapshot: project.title || '',
    updatedAt: db.serverDate()
  };
  if (primary) await db.collection('reminders').doc(primary._id).update({ data });
  else {
    try { await db.collection('reminders').add({ data: { ...data, createdAt: db.serverDate() } }); }
    catch (error) {
      const concurrent = (await findReminder(db, ownerId, taskId, CHANNELS.WECHAT_SUBSCRIPTION))[0];
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
  CHANNEL, CHANNELS, MAX_OFFSET_MINUTES, normalizeReminderConfig, calculateScheduledAt,
  taskCanBeReminded, dedupeKey, findReminder, cancelTaskReminder, syncTaskReminder,
  syncWechatSubscription, buildWechatPagePath, buildWechatSendData
};
