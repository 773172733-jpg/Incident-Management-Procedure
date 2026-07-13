const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const auth = require('../../common/auth');
const { success, fail } = require('../../common/response');
const { getAll } = require('../../common/query');
const { monthKeys, monthInstants, buildProjectEntry, buildTaskEntry, aggregateDays } = require('../../common/calendar-entry');

function validTimezone(value) {
  const timezone = typeof value === 'string' && value ? value : 'Asia/Shanghai';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); return timezone; }
  catch (error) { return null; }
}

async function month(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const year = Number(payload.year), monthNumber = Number(payload.month);
  const timezone = validTimezone(payload.timezone);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12 || !timezone) {
    return fail('INVALID_PARAMS', '年份、月份或时区无效');
  }

  const bounds = monthKeys(year, monthNumber);
  const instants = monthInstants(year, monthNumber, timezone);
  try {
    const projects = await getAll(db.collection('projects').where({ ownerId: openid, deletedAt: _.eq(null) }));
    const projectMap = {};
    projects.forEach(project => { projectMap[project._id] = project; });

    const deadlineTasks = await getAll(db.collection('tasks').where({
      ownerId: openid, deletedAt: _.eq(null), scheduleType: 'deadline', dueAt: _.gte(instants.start).and(_.lte(instants.end))
    }));
    const rangeTasks = await getAll(db.collection('tasks').where({
      ownerId: openid, deletedAt: _.eq(null), scheduleType: 'range', startAt: _.lte(instants.end)
    }));

    const entries = [];
    projects.forEach(project => {
      try { const entry = buildProjectEntry(project, bounds, timezone); if (entry) entries.push(entry); }
      catch (error) { console.warn('[calendar.month] skip invalid project:', project._id, error.message); }
    });
    deadlineTasks.concat(rangeTasks).forEach(task => {
      try { const entry = buildTaskEntry(task, projectMap[task.projectId], bounds, timezone); if (entry) entries.push(entry); }
      catch (error) { console.warn('[calendar.month] skip invalid task:', task._id, error.message); }
    });

    const unique = [];
    const seen = new Set();
    entries.forEach(entry => {
      const key = `${entry.entryType}:${entry.id}`;
      if (!seen.has(key)) { seen.add(key); unique.push(entry); }
    });
    return success({ year, month: monthNumber, timezone, days: aggregateDays(unique), entries: unique });
  } catch (error) {
    console.error('[calendar.month]', error);
    return fail('INTERNAL_ERROR', '日历查询失败');
  }
}

async function day() { return fail('NOT_IMPLEMENTED', '请使用calendar.month'); }

module.exports = { month, day };
