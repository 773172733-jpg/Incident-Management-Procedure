const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const auth = require('../../common/auth');
const permission = require('../../common/permission');
const { success, fail } = require('../../common/response');
const { validateObjectId } = require('../../common/validator');
const { normalizeReminderConfig, calculateScheduledAt, taskCanBeReminded, findReminder, cancelTaskReminder, syncTaskReminder } = require('../../common/reminder');
const { getEffectiveDueAt } = require('../../common/task-time');
const { getAll } = require('../../common/query');

async function ownedTask(openid, taskId) {
  const taskRes = await db.collection('tasks').doc(taskId).get().catch(() => ({ data: null }));
  const task = taskRes.data;
  if (!task || task.ownerId !== openid) return null;
  const projectRes = await db.collection('projects').doc(task.projectId).get().catch(() => ({ data: null }));
  const project = projectRes.data;
  return project && permission.canReadTask(openid, task, project) ? { task, project } : null;
}

async function getByTask(payload, context) {
  const openid = auth.getUserId(context), id = validateObjectId(payload.taskId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const owned = await ownedTask(openid, id.value);
  if (!owned) return fail('TASK_NOT_FOUND', '任务不存在或无权访问');
  const reminders = await findReminder(db, openid, id.value);
  return success({
    config: {
      reminderMode: owned.task.reminderMode || 'none',
      reminderOffsetMinutes: owned.task.reminderOffsetMinutes || null,
      reminderCustomAt: owned.task.reminderCustomAt || null
    },
    reminder: reminders[0] || null
  });
}

async function upsert(payload, context) {
  const openid = auth.getUserId(context), id = validateObjectId(payload.taskId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const owned = await ownedTask(openid, id.value);
  if (!owned || owned.task.deletedAt || owned.project.deletedAt) return fail('TASK_NOT_FOUND', '任务不存在或无权修改');
  const parsed = normalizeReminderConfig(payload, owned.task);
  if (parsed.error) return fail('INVALID_PARAMS', parsed.error);
  const task = { ...owned.task, ...parsed.data };
  if (parsed.data.reminderMode !== 'none' && !taskCanBeReminded(task, owned.project)) return fail('INVALID_PARAMS', '当前任务不能设置提醒');
  const schedule = calculateScheduledAt(parsed.data, getEffectiveDueAt(task));
  if (schedule.error) return fail('INVALID_PARAMS', schedule.error);
  await db.collection('tasks').doc(task._id).update({ data: { ...parsed.data, updatedAt: db.serverDate() } });
  const result = await syncTaskReminder(db, task, owned.project);
  if (result.warning && !result.expired) return fail('INVALID_PARAMS', result.warning);
  return success({ reminder: result }, parsed.data.reminderMode === 'none' ? '提醒已关闭' : '提醒已保存');
}

async function cancel(payload, context) {
  const openid = auth.getUserId(context), id = validateObjectId(payload.taskId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const owned = await ownedTask(openid, id.value);
  if (!owned) { await cancelTaskReminder(db, openid, id.value); return success(null, '提醒已关闭'); }
  await cancelTaskReminder(db, openid, id.value);
  await db.collection('tasks').doc(id.value).update({ data: {
    reminderMode: 'none', reminderOffsetMinutes: null, reminderCustomAt: null, updatedAt: db.serverDate()
  } });
  return success(null, '提醒已关闭');
}

async function listUnread(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const rows = await getAll(db.collection('reminders').where({ ownerId: openid, status: 'triggered' }).orderBy('scheduledAt', 'desc'));
  const valid = [];
  for (const reminder of rows) {
    if (!reminder || !reminder._id) continue;
    const owned = await ownedTask(openid, reminder.taskId);
    const taskDueAt = owned ? getEffectiveDueAt(owned.task) : null;
    const reminderDueAt = reminder.dueAt ? new Date(reminder.dueAt) : null;
    const dueMatches = taskDueAt && reminderDueAt && !Number.isNaN(reminderDueAt.getTime())
      && new Date(taskDueAt).getTime() === reminderDueAt.getTime();
    if (owned && owned.task.reminderMode && owned.task.reminderMode !== 'none'
      && taskCanBeReminded(owned.task, owned.project) && dueMatches) valid.push(reminder);
    else await db.collection('reminders').where({ _id: reminder._id, ownerId: openid, status: 'triggered' }).update({
      data: { status: 'cancelled', cancelledAt: db.serverDate(), updatedAt: db.serverDate() }
    }).catch(error => console.warn('[reminder.listUnread] cleanup failed:', reminder._id, error.message));
  }
  return success({ reminders: valid, unreadCount: valid.length });
}

async function markRead(payload, context) {
  const openid = auth.getUserId(context), id = validateObjectId(payload.reminderId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  if (!id.valid) return fail('INVALID_PARAMS', id.message);
  const row = await db.collection('reminders').doc(id.value).get().catch(() => ({ data: null }));
  if (!row.data || row.data.ownerId !== openid) return fail('NOT_FOUND', '提醒不存在');
  if (row.data.status === 'read') return success(null, '提醒已读');
  if (row.data.status !== 'triggered') return success(null, '提醒无需处理');
  await db.collection('reminders').where({ _id: id.value, ownerId: openid, status: 'triggered' }).update({
    data: { status: 'read', readAt: db.serverDate(), updatedAt: db.serverDate() }
  });
  return success(null, '提醒已读');
}

async function markAllRead(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const result = await db.collection('reminders').where({ ownerId: openid, status: 'triggered' }).update({
    data: { status: 'read', readAt: db.serverDate(), updatedAt: db.serverDate() }
  });
  return success({ updated: result.stats ? result.stats.updated : 0 }, '提醒已全部标为已读');
}

module.exports = { getByTask, upsert, cancel, listUnread, markRead, markAllRead };
