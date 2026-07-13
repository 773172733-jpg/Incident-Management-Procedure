const { getEffectiveDueAt, isTaskOverdue } = require('./task-time');

const formatters = new Map();

function formatter(timezone) {
  if (!formatters.has(timezone)) {
    formatters.set(timezone, new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }));
  }
  return formatters.get(timezone);
}

function dateKey(value, timezone) {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = formatter(timezone).formatToParts(date);
  const values = {};
  parts.forEach(part => { if (part.type !== 'literal') values[part.type] = part.value; });
  return `${values.year}-${values.month}-${values.day}`;
}

function monthKeys(year, month) {
  const pad = value => String(value).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startKey: `${year}-${pad(month)}-01`, endKey: `${year}-${pad(month)}-${pad(lastDay)}` };
}

function timezoneOffset(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = {};
  parts.forEach(part => { if (part.type !== 'literal') values[part.type] = Number(part.value); });
  return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second) - date.getTime();
}

function zonedTime(year, month, day, hour, minute, second, millisecond, timezone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return new Date(guess.getTime() - timezoneOffset(guess, timezone));
}

function monthInstants(year, month, timezone) {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = zonedTime(year, month, 1, 0, 0, 0, 0, timezone);
  const nextStart = zonedTime(nextYear, nextMonth, 1, 0, 0, 0, 0, timezone);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

function keysBetween(startKey, endKey, bounds) {
  const first = startKey > bounds.startKey ? startKey : bounds.startKey;
  const last = endKey < bounds.endKey ? endKey : bounds.endKey;
  if (!first || !last || first > last) return [];
  const parts = first.split('-').map(Number);
  const cursor = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const keys = [];
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (key > last) break;
    keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function projectTimeText(project, timezone) {
  if (project.timeMode === 'ongoing') return '持续进行';
  const start = dateKey(project.startAt, timezone);
  const end = dateKey(project.endAt, timezone);
  return start && end ? `${start.replace(/-/g, '.')}—${end.replace(/-/g, '.')}` : '';
}

function buildProjectEntry(project, bounds, timezone) {
  const timeMode = project.timeMode || 'none';
  if (project.deletedAt || project.status === 'cancelled') return null;
  let dateKeys = [];
  if (timeMode === 'range') {
    const startKey = dateKey(project.startAt, timezone);
    const endKey = dateKey(project.endAt, timezone);
    if (!startKey || !endKey || endKey < startKey) return null;
    dateKeys = keysBetween(startKey, endKey, bounds);
  } else if (timeMode === 'ongoing') {
    const startKey = dateKey(project.startAt, timezone);
    if (startKey >= bounds.startKey && startKey <= bounds.endKey) dateKeys = [startKey];
  }
  if (!dateKeys.length) return null;
  const status = project.status || 'active';
  return {
    id: project._id, entryType: 'project', projectId: project._id,
    title: project.title || '未命名事件', projectTitle: project.title || '未命名事件',
    iconType: project.iconType || 'text', iconValue: project.iconValue || (project.title || '事').slice(0, 1),
    themeColor: project.themeColor || '#FF6B35', status,
    statusText: status === 'archived' ? '已归档' : status === 'completed' ? '已结束' : '进行中',
    timeMode, scheduleType: null, startAt: project.startAt || null, endAt: project.endAt || null,
    dueAt: null, dateKeys, isCompleted: status === 'completed', isArchived: status === 'archived',
    isClosedByParent: false, overdue: false, timeText: projectTimeText(project, timezone)
  };
}

function taskTimeText(task, effectiveDueAt, timezone) {
  const dueKey = dateKey(effectiveDueAt, timezone);
  if (task.scheduleType === 'deadline') return dueKey ? `截止 ${dueKey.replace(/-/g, '.')}` : '';
  const startKey = dateKey(task.startAt, timezone);
  return startKey && dueKey ? `${startKey.replace(/-/g, '.')}—${dueKey.replace(/-/g, '.')}` : '';
}

function buildTaskEntry(task, project, bounds, timezone) {
  if (!project || project.status === 'cancelled' || task.deletedAt || task.scheduleType === 'none') return null;
  const effectiveDueAt = getEffectiveDueAt(task);
  const dueKey = dateKey(effectiveDueAt, timezone);
  let dateKeys = [];
  if (task.scheduleType === 'deadline' && dueKey >= bounds.startKey && dueKey <= bounds.endKey) dateKeys = [dueKey];
  if (task.scheduleType === 'range') {
    const startKey = dateKey(task.startAt, timezone);
    if (!startKey || !dueKey || dueKey < startKey) return null;
    dateKeys = keysBetween(startKey, dueKey, bounds);
  }
  if (!dateKeys.length) return null;
  const status = task.status || 'todo';
  const isCompleted = status === 'completed' || status === 'approved';
  const statusMap = { todo: '未完成', doing: '进行中', completed: '已完成', approved: '已完成', closed_by_parent: '随事件结束' };
  const priorityMap = { core: '核心', important: '重要', optional: '可选' };
  return {
    id: task._id, entryType: 'task', projectId: task.projectId,
    title: task.title || '未命名任务', projectTitle: project.title || '未命名事件',
    iconType: project.iconType || 'text', iconValue: project.iconValue || (project.title || '事').slice(0, 1),
    themeColor: project.themeColor || '#FF6B35', priority: task.priority || 'optional',
    priorityText: priorityMap[task.priority] || '可选', status, statusText: statusMap[status] || status,
    timeMode: null, scheduleType: task.scheduleType, startAt: task.startAt || null,
    endAt: task.endAt || null, dueAt: effectiveDueAt ? effectiveDueAt.toISOString() : null,
    dateKeys, isCompleted, isArchived: false, isClosedByParent: status === 'closed_by_parent',
    overdue: isTaskOverdue(task), timeText: taskTimeText(task, effectiveDueAt, timezone)
  };
}

function aggregateDays(entries) {
  const days = {};
  entries.forEach(entry => entry.dateKeys.forEach(key => {
    if (!days[key]) days[key] = { total: 0, projectCount: 0, taskCount: 0, activeCount: 0, completedCount: 0, archivedCount: 0, closedByParentCount: 0 };
    const day = days[key];
    day.total += 1;
    day[entry.entryType === 'project' ? 'projectCount' : 'taskCount'] += 1;
    if (entry.isArchived) day.archivedCount += 1;
    else if (entry.isClosedByParent) day.closedByParentCount += 1;
    else if (entry.isCompleted) day.completedCount += 1;
    else day.activeCount += 1;
  }));
  return days;
}

module.exports = { dateKey, monthKeys, monthInstants, buildProjectEntry, buildTaskEntry, aggregateDays };
