/**
 * 事件树 - 提醒工作线程
 * 定时扫描 pending 提醒并发送
 * 阶段 5 会完整实现，阶段 0 建立骨架
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  console.log('[reminder-worker] started');

  try {
    const now = new Date();
    const pendingReminders = await db.collection('reminders')
      .where({
        status: 'pending',
        triggerAt: _.lte(now)
      })
      .limit(100)
      .get();

    if (pendingReminders.data.length === 0) {
      console.log('[reminder-worker] no pending reminders');
      return { processed: 0 };
    }

    console.log('[reminder-worker] found ' + pendingReminders.data.length + ' reminders to process');

    const ids = pendingReminders.data.map(r => r._id);
    await db.collection('reminders').where({
      _id: _.in(ids),
      status: 'pending'
    }).update({
      data: { status: 'processing', updatedAt: db.serverDate() }
    });

    for (const reminder of pendingReminders.data) {
      try {
        await processReminder(reminder);
      } catch (err) {
        console.error('[reminder-worker] failed reminder ' + reminder._id + ':', err);
        await db.collection('reminders').doc(reminder._id).update({
          data: {
            status: 'failed',
            failedReason: String(err.message).substring(0, 200),
            retryCount: (reminder.retryCount || 0) + 1,
            updatedAt: db.serverDate()
          }
        });
      }
    }

    return { processed: pendingReminders.data.length };
  } catch (err) {
    console.error('[reminder-worker] error:', err);
    return { processed: 0, error: err.message };
  }
};

async function processReminder(reminder) {
  if (reminder.taskId) {
    const task = await db.collection('tasks').doc(reminder.taskId).get();
    if (!task.data || task.data.deletedAt || task.data.status === 'completed' || task.data.status === 'cancelled') {
      await db.collection('reminders').doc(reminder._id).update({
        data: { status: 'cancelled', updatedAt: db.serverDate() }
      });
      return;
    }
  }

  if (reminder.channel === 'in_app') {
    await db.collection('reminders').doc(reminder._id).update({
      data: { status: 'sent', sentAt: db.serverDate(), updatedAt: db.serverDate() }
    });
  } else {
    await db.collection('reminders').doc(reminder._id).update({
      data: { status: 'failed', failedReason: '不支持的提醒渠道', updatedAt: db.serverDate() }
    });
  }
}
