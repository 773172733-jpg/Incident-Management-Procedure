const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { WECHAT_SUBSCRIPTION_TEMPLATE, priorityText } = require('./wechat-subscription');

const BATCH_SIZE = 100;
const RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];

exports.main = async () => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const stats = { scanned: 0, claimed: 0, triggered: 0, sent: 0, cancelled: 0, failed: 0 };
  try {
    const [pendingResult, retryResult, staleResult] = await Promise.all([
      db.collection('reminders').where({ status: 'pending', scheduledAt: _.lte(now) }).orderBy('scheduledAt', 'asc').limit(BATCH_SIZE).get(),
      db.collection('reminders').where({ status: 'failed', nextRetryAt: _.lte(now) }).orderBy('nextRetryAt', 'asc').limit(BATCH_SIZE).get(),
      db.collection('reminders').where({ status: 'processing', processingAt: _.lte(staleBefore) }).orderBy('processingAt', 'asc').limit(BATCH_SIZE).get()
    ]);
    const candidates = dedupe((pendingResult.data || []).concat(retryResult.data || [], staleResult.data || []))
      .sort((left, right) => candidateTime(left) - candidateTime(right))
      .slice(0, BATCH_SIZE);
    stats.scanned = candidates.length;
    for (const reminder of candidates) {
      const claimed = await claim(reminder, now, staleBefore);
      if (!claimed) continue;
      stats.claimed += 1;
      try {
        const result = await processReminder(reminder);
        stats[result] += 1;
      } catch (error) {
        await recordFailure(reminder, error);
        stats.failed += 1;
        console.error('[reminder-worker] reminder failed:', reminder._id, error.message);
      }
    }
    return stats;
  } catch (error) {
    console.error('[reminder-worker] batch failed:', error);
    return { ...stats, error: error.message };
  }
};

function dedupe(rows) {
  const seen = new Set();
  return rows.filter(row => {
    if (!row || !row._id || seen.has(row._id)) return false;
    seen.add(row._id);
    return true;
  });
}

function candidateTime(reminder) {
  const value = reminder.nextRetryAt || reminder.processingAt || reminder.scheduledAt;
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function claim(reminder, now, staleBefore) {
  const expected = reminder.status;
  const filter = { _id: reminder._id, status: expected };
  if (expected === 'pending') filter.scheduledAt = reminder.scheduledAt;
  else if (expected === 'failed') filter.nextRetryAt = reminder.nextRetryAt;
  else if (expected === 'processing') filter.processingAt = _.lte(staleBefore);
  const result = await db.collection('reminders').where(filter).update({
    data: { status: 'processing', processingAt: now, updatedAt: db.serverDate() }
  });
  return Boolean(result.stats && result.stats.updated === 1);
}

async function processReminder(reminder) {
  const taskResult = await db.collection('tasks').doc(reminder.taskId).get().catch(() => ({ data: null }));
  const task = taskResult.data;
  if (!validTask(task)) return cancel(reminder._id);
  const projectResult = await db.collection('projects').doc(task.projectId).get().catch(() => ({ data: null }));
  const project = projectResult.data;
  if (!project || project.deletedAt || project.ownerId !== reminder.ownerId) return cancel(reminder._id);
  const dueAt = effectiveDueAt(task);
  const reminderDueAt = validDate(reminder.dueAt);
  if (!dueAt || !reminderDueAt || dueAt.getTime() !== reminderDueAt.getTime()) return cancel(reminder._id);
  if (reminder.channel === 'wechat_subscription') return sendWechatSubscription(reminder, task, project, dueAt);
  if (reminder.channel !== 'in_app') return cancel(reminder._id);
  const result = await db.collection('reminders').where({ _id: reminder._id, status: 'processing' }).update({
    data: { status: 'triggered', triggeredAt: db.serverDate(), processingAt: null, nextRetryAt: null, lastError: '', updatedAt: db.serverDate() }
  });
  if (!result.stats || result.stats.updated !== 1) throw new Error('in_app reminder status changed by another worker');
  return 'triggered';
}

async function sendWechatSubscription(reminder, task, project, dueAt) {
  if (!WECHAT_SUBSCRIPTION_TEMPLATE.enabled || reminder.templateId !== WECHAT_SUBSCRIPTION_TEMPLATE.id) {
    throw nonRetryable('invalid templateId');
  }
  const scheduledAt = validDate(reminder.scheduledAt);
  if (!scheduledAt) throw nonRetryable('invalid scheduledAt');
  const page = validPagePath(reminder.pagePath) || buildPagePath(project._id, task._id);
  const data = reminder.sendDataSnapshot || buildSendData(task, project, scheduledAt, dueAt);
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: reminder.ownerId,
      templateId: reminder.templateId,
      page,
      data
    });
  } catch (error) {
    const message = String(error && (error.errMsg || error.message) || error);
    console.error('[reminder-worker] subscribeMessage.send failed:', {
      errCode: error && (error.errCode || error.errcode || error.code),
      errMsg: message
    });
    if (!isRetryableWechatError(error, message)) throw nonRetryable(message);
    throw error;
  }
  const result = await db.collection('reminders').where({ _id: reminder._id, status: 'processing' }).update({
    data: {
      status: 'sent',
      sentAt: db.serverDate(),
      authorizationConsumedAt: db.serverDate(),
      processingAt: null,
      nextRetryAt: null,
      lastError: '',
      updatedAt: db.serverDate()
    }
  });
  if (!result.stats || result.stats.updated !== 1) throw new Error('wechat reminder status changed by another worker');
  return 'sent';
}

function validTask(task) {
  return Boolean(task && !task.deletedAt && ['deadline', 'range'].includes(task.scheduleType)
    && !['completed', 'approved', 'closed_by_parent', 'cancelled'].includes(task.status)
    && task.reminderMode && task.reminderMode !== 'none');
}

function effectiveDueAt(task) { return validDate(task && (task.dueAt || task.endAt)); }
function validDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function pad(number) { return String(number).padStart(2, '0'); }
function formatTime(value) {
  const date = validDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function truncateThing(value, max = 20) {
  const text = String(value || '').trim();
  if (!text) return '未命名';
  return text.length > max ? text.slice(0, max) : text;
}
function buildSendData(task, project, scheduledAt, dueAt) {
  const fields = WECHAT_SUBSCRIPTION_TEMPLATE.fields;
  return {
    [fields.taskTitle]: { value: truncateThing(task.title) },
    [fields.projectTitle]: { value: truncateThing(project.title) },
    [fields.dueAt]: { value: formatTime(dueAt) },
    [fields.scheduledAt]: { value: formatTime(scheduledAt) },
    [fields.priority]: { value: priorityText(task.priority) }
  };
}
function buildPagePath(projectId, taskId) {
  return `/pages/project-detail/project-detail?id=${encodeURIComponent(projectId)}&taskId=${encodeURIComponent(taskId)}`;
}
function validPagePath(value) {
  return typeof value === 'string' && value.indexOf('/pages/project-detail/project-detail?') === 0 ? value : '';
}
function nonRetryable(message) {
  const error = new Error(message);
  error.nonRetryable = true;
  return error;
}
function isRetryableWechatError(error, message) {
  if (error && error.nonRetryable) return false;
  const code = Number(error && (error.errCode || error.errcode || error.code));
  if ([40037, 41030, 43101, 43107, 47003].includes(code)) return false;
  if (/40037|41030|43101|43107|47003|invalid template|invalid page|user refuse|subscribe/i.test(message)) return false;
  return /timeout|timed?out|network|ECONN|ETIMEDOUT|limit|busy|system|unavailable|internal/i.test(message) || !code;
}

async function cancel(reminderId) {
  await db.collection('reminders').where({ _id: reminderId, status: 'processing' }).update({
    data: { status: 'cancelled', cancelledAt: db.serverDate(), processingAt: null, updatedAt: db.serverDate() }
  });
  return 'cancelled';
}

async function recordFailure(reminder, error) {
  const retryCount = (Number(reminder.retryCount) || 0) + 1;
  const maxRetries = Math.max(0, Number(reminder.maxRetries) || 3);
  const canRetry = !error.nonRetryable && retryCount < maxRetries;
  const data = {
    status: 'failed', retryCount,
    nextRetryAt: canRetry ? new Date(Date.now() + (RETRY_DELAYS_MS[retryCount - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1])) : null,
    processingAt: null,
    failedAt: canRetry ? null : db.serverDate(),
    lastError: String(error && error.message || error).slice(0, 300),
    updatedAt: db.serverDate()
  };
  await db.collection('reminders').where({ _id: reminder._id, status: 'processing' }).update({ data });
}
