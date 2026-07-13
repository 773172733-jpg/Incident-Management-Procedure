const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const BATCH_SIZE = 100;
const RETRY_DELAY_MS = 5 * 60 * 1000;

exports.main = async () => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const stats = { scanned: 0, claimed: 0, triggered: 0, cancelled: 0, failed: 0 };
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
  if (reminder.channel !== 'in_app') throw new Error('当前仅支持in_app提醒');
  const result = await db.collection('reminders').where({ _id: reminder._id, status: 'processing' }).update({
    data: { status: 'triggered', triggeredAt: db.serverDate(), processingAt: null, nextRetryAt: null, lastError: '', updatedAt: db.serverDate() }
  });
  if (!result.stats || result.stats.updated !== 1) throw new Error('提醒状态已被其他worker修改');
  return 'triggered';
}

function validTask(task) {
  return Boolean(task && !task.deletedAt && ['deadline', 'range'].includes(task.scheduleType)
    && !['completed', 'approved', 'closed_by_parent', 'cancelled'].includes(task.status)
    && task.reminderMode && task.reminderMode !== 'none');
}

function effectiveDueAt(task) { return validDate(task && (task.dueAt || task.endAt)); }
function validDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }

async function cancel(reminderId) {
  await db.collection('reminders').where({ _id: reminderId, status: 'processing' }).update({
    data: { status: 'cancelled', cancelledAt: db.serverDate(), processingAt: null, updatedAt: db.serverDate() }
  });
  return 'cancelled';
}

async function recordFailure(reminder, error) {
  const retryCount = (Number(reminder.retryCount) || 0) + 1;
  const maxRetries = Math.max(0, Number(reminder.maxRetries) || 3);
  const canRetry = retryCount < maxRetries;
  const data = {
    status: 'failed', retryCount,
    nextRetryAt: canRetry ? new Date(Date.now() + RETRY_DELAY_MS) : null,
    processingAt: null,
    failedAt: canRetry ? null : db.serverDate(),
    lastError: String(error && error.message || error).slice(0, 300),
    updatedAt: db.serverDate()
  };
  await db.collection('reminders').where({ _id: reminder._id, status: 'processing' }).update({ data });
}
