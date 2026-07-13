const assert = require('assert');
const {
  monthKeys, monthInstants, buildProjectEntry, buildTaskEntry, aggregateDays
} = require('../cloudfunctions/api/common/calendar-entry');

const timezone = 'Asia/Shanghai';
const july = monthKeys(2026, 7);
const august = monthKeys(2026, 8);
const baseProject = { _id: 'p1', title: '事件', status: 'active', deletedAt: null, themeColor: '#FF6B35' };

assert.equal(buildProjectEntry({ ...baseProject, timeMode: 'none' }, july, timezone), null);
const julyRange = buildProjectEntry({ ...baseProject, timeMode: 'range', startAt: '2026-07-28', endAt: '2026-08-03' }, july, timezone);
assert.deepEqual(julyRange.dateKeys, ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']);
const augustRange = buildProjectEntry({ ...baseProject, timeMode: 'range', startAt: '2026-07-28', endAt: '2026-08-03' }, august, timezone);
assert.deepEqual(augustRange.dateKeys, ['2026-08-01', '2026-08-02', '2026-08-03']);
assert.equal(buildProjectEntry({ ...baseProject, timeMode: 'range', startAt: null, endAt: '2026-07-20' }, july, timezone), null);
assert.deepEqual(buildProjectEntry({ ...baseProject, timeMode: 'ongoing', startAt: '2026-07-15' }, july, timezone).dateKeys, ['2026-07-15']);
assert.equal(buildProjectEntry({ ...baseProject, timeMode: 'ongoing', startAt: null }, july, timezone), null);
assert.equal(buildProjectEntry({ ...baseProject, timeMode: 'range', startAt: '2026-07-01', endAt: '2026-07-02', deletedAt: new Date() }, july, timezone), null);

const completed = buildProjectEntry({ ...baseProject, _id: 'p2', status: 'completed', timeMode: 'ongoing', startAt: '2026-07-15' }, july, timezone);
const archived = buildProjectEntry({ ...baseProject, _id: 'p3', status: 'archived', timeMode: 'ongoing', startAt: '2026-07-15' }, july, timezone);
assert.equal(completed.isCompleted, true); assert.equal(completed.statusText, '已结束');
assert.equal(archived.isArchived, true); assert.equal(archived.statusText, '已归档');

const deadline = buildTaskEntry({ _id: 't1', projectId: 'p1', title: '截止任务', scheduleType: 'deadline', dueAt: '2026-07-15T10:00:00+08:00', status: 'todo' }, baseProject, july, timezone);
assert.deepEqual(deadline.dateKeys, ['2026-07-15']);
const oldRange = buildTaskEntry({ _id: 't2', projectId: 'p1', title: '旧任务', scheduleType: 'range', startAt: '2026-06-30T10:00:00+08:00', endAt: '2026-07-02T18:00:00+08:00', status: 'closed_by_parent' }, baseProject, july, timezone);
assert.deepEqual(oldRange.dateKeys, ['2026-07-01', '2026-07-02']); assert.equal(oldRange.isClosedByParent, true);
assert.equal(buildTaskEntry({ _id: 't3', projectId: 'p1', scheduleType: 'none' }, baseProject, july, timezone), null);
assert.equal(buildTaskEntry({ _id: 't4', projectId: 'p1', scheduleType: 'deadline', dueAt: '2026-07-15', deletedAt: new Date() }, baseProject, july, timezone), null);

const days = aggregateDays([julyRange, completed, archived, deadline, oldRange]);
assert.deepEqual(days['2026-07-15'], { total: 3, projectCount: 2, taskCount: 1, activeCount: 1, completedCount: 1, archivedCount: 1, closedByParentCount: 0 });
assert.equal(days['2026-07-01'].closedByParentCount, 1);
const instants = monthInstants(2026, 7, timezone);
assert.equal(instants.start.toISOString(), '2026-06-30T16:00:00.000Z');
assert.equal(instants.end.toISOString(), '2026-07-31T15:59:59.999Z');

console.log('calendar aggregation tests: PASS');
