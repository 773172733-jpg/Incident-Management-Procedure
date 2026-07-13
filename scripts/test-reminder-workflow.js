const assert = require('assert');
const fs = require('fs');
const {
  normalizeReminderConfig, calculateScheduledAt, taskCanBeReminded,
  dedupeKey, syncTaskReminder, cancelTaskReminder, syncWechatSubscription, buildWechatPagePath
} = require('../cloudfunctions/api/common/reminder');
const { WECHAT_SUBSCRIPTION_TEMPLATE } = require('../cloudfunctions/api/common/wechat-subscription');

const dueAt = new Date('2026-07-20T10:00:00+08:00');
const now = new Date('2026-07-20T08:00:00+08:00');

assert.deepEqual(normalizeReminderConfig({ mode: 'none' }).data, { reminderMode: 'none', reminderOffsetMinutes: null, reminderCustomAt: null });
assert.equal(calculateScheduledAt(normalizeReminderConfig({ mode: 'at_due' }).data, dueAt, now).scheduledAt.getTime(), dueAt.getTime());
assert.equal(calculateScheduledAt(normalizeReminderConfig({ mode: 'offset', offsetMinutes: 30 }).data, dueAt, now).scheduledAt.toISOString(), '2026-07-20T01:30:00.000Z');
assert.equal(calculateScheduledAt(normalizeReminderConfig({ mode: 'custom', customAt: '2026-07-20T09:00:00+08:00' }).data, dueAt, now).scheduledAt.toISOString(), '2026-07-20T01:00:00.000Z');
assert.equal(normalizeReminderConfig({ mode: 'offset', offsetMinutes: 0 }).error, '提醒提前时间无效');
assert.equal(calculateScheduledAt(normalizeReminderConfig({ mode: 'custom', customAt: '2026-07-20T11:00:00+08:00' }).data, dueAt, now).error, '提醒时间不能晚于截止时间');
assert.equal(calculateScheduledAt(normalizeReminderConfig({ mode: 'offset', offsetMinutes: 180 }).data, dueAt, now).expired, true);

const project = { _id: 'p1', ownerId: 'u1', title: '事件', deletedAt: null };
const task = { _id: 't1', ownerId: 'u1', projectId: 'p1', title: '任务', scheduleType: 'deadline', dueAt, status: 'todo', deletedAt: null, reminderMode: 'offset', reminderOffsetMinutes: 30 };
assert.equal(taskCanBeReminded(task, project), true);
assert.equal(taskCanBeReminded({ ...task, status: 'completed' }, project), false);
assert.equal(taskCanBeReminded({ ...task, status: 'closed_by_parent' }, project), false);
assert.equal(taskCanBeReminded({ ...task, deletedAt: now }, project), false);
assert.equal(taskCanBeReminded({ ...task, scheduleType: 'range', startAt: now }, project), true);
assert.equal(taskCanBeReminded({ ...task, reminderMode: undefined }, project), true);
assert.equal(dedupeKey('u1', 't1'), 'u1:t1:in_app');
assert.equal(dedupeKey('u1', 't1', 'wechat_subscription'), 'u1:t1:wechat_subscription');
assert.equal(buildWechatPagePath('p 1', 't 1'), '/pages/project-detail/project-detail?id=p%201&taskId=t%201');

const workerSource = fs.readFileSync(require.resolve('../cloudfunctions/reminder-worker/index'), 'utf8');
const routerSource = fs.readFileSync(require.resolve('../cloudfunctions/api/router'), 'utf8');
const reminderModule = require('../cloudfunctions/api/modules/reminder');
const taskEditSource = fs.readFileSync(require.resolve('../miniprogram/pages/task-edit/task-edit'), 'utf8');
assert(workerSource.includes("status: 'processing'"));
assert(workerSource.includes("status: 'triggered'"));
assert(workerSource.includes("status: 'sent'"));
assert(workerSource.includes('processingAt: _.lte(staleBefore)'));
assert(workerSource.includes('subscribeMessage.send'));
assert(routerSource.includes('reminder: reminderModule'));
['getByTask', 'upsert', 'cancel', 'getWechatSubscriptionByTask', 'upsertWechatSubscription', 'cancelWechatSubscription', 'listUnread', 'markRead', 'markAllRead'].forEach(name => assert.equal(typeof reminderModule[name], 'function'));
assert(taskEditSource.indexOf('requestWechatSubscription') < taskEditSource.indexOf('taskService.update'));
assert(taskEditSource.includes("console.warn('[task-edit] wechat reminder upsert failed:'"));

function mockDb() {
  const reminders = [];
  let nextId = 1;
  const command = { in(values) { return { op: 'in', values }; } };
  function matches(row, filter) {
    return Object.keys(filter).every(key => filter[key] && filter[key].op === 'in'
      ? filter[key].values.includes(row[key]) : row[key] === filter[key]);
  }
  return {
    reminders, command, serverDate() { return new Date(); },
    collection(name) {
      assert.equal(name, 'reminders');
      return {
        where(filter) {
          return {
            limit() { return this; },
            async get() { return { data: reminders.filter(row => matches(row, filter)).map(row => ({ ...row })) }; },
            async update({ data }) { let updated = 0; reminders.forEach(row => { if (matches(row, filter)) { Object.assign(row, data); updated += 1; } }); return { stats: { updated } }; }
          };
        },
        doc(id) { return { async update({ data }) { const row = reminders.find(item => item._id === id); Object.assign(row, data); return { stats: { updated: 1 } }; } }; },
        async add({ data }) { const row = { ...data, _id: `r${nextId++}` }; reminders.push(row); return { _id: row._id }; }
      };
    }
  };
}

(async () => {
  const db = mockDb();
  await syncTaskReminder(db, task, project, now);
  await syncTaskReminder(db, { ...task, dueAt: new Date('2026-07-20T11:00:00+08:00') }, project, now);
  assert.equal(db.reminders.length, 1);
  assert.equal(db.reminders[0].status, 'pending');
  assert.equal(db.reminders[0].scheduledAt.toISOString(), '2026-07-20T02:30:00.000Z');
  await syncTaskReminder(db, { ...task, status: 'completed' }, project, now);
  assert.equal(db.reminders[0].status, 'cancelled');
  await syncTaskReminder(db, task, project, now);
  assert.equal(db.reminders[0].status, 'pending');
  await cancelTaskReminder(db, task.ownerId, task._id);
  assert.equal(db.reminders[0].status, 'cancelled');
  await cancelTaskReminder(db, task.ownerId, task._id);
  assert.equal(db.reminders[0].status, 'cancelled');
  await syncTaskReminder(db, { ...task, deletedAt: now }, project, now);
  assert.equal(db.reminders[0].status, 'cancelled');
  await syncTaskReminder(db, task, { ...project, deletedAt: now }, now);
  assert.equal(db.reminders[0].status, 'cancelled');
  await syncTaskReminder(db, { ...task, reminderMode: 'none' }, project, now);
  assert.equal(db.reminders[0].status, 'cancelled');
  const expired = await syncTaskReminder(db, { ...task, reminderOffsetMinutes: 180 }, project, now);
  assert.equal(expired.expired, true);
  assert.equal(db.reminders[0].status, 'cancelled');
  const wechat = await syncWechatSubscription(db, task, project, {
    templateId: WECHAT_SUBSCRIPTION_TEMPLATE.id,
    authorizationResult: 'accept'
  }, now);
  assert.equal(wechat.scheduled, true);
  assert.equal(db.reminders.length, 2);
  const wechatRow = db.reminders.find(item => item.channel === 'wechat_subscription');
  assert.equal(wechatRow.status, 'pending');
  assert.equal(wechatRow.templateId, WECHAT_SUBSCRIPTION_TEMPLATE.id);
  assert.equal(wechatRow.sendDataSnapshot.thing1.value, '任务');
  assert.equal(wechatRow.sendDataSnapshot.thing18.value, '事件');
  await cancelTaskReminder(db, task.ownerId, task._id, { channel: 'wechat_subscription', statuses: ['pending', 'processing', 'failed'] });
  assert.equal(wechatRow.status, 'cancelled');
  console.log('reminder workflow tests: PASS');
})().catch(error => { console.error(error); process.exit(1); });
