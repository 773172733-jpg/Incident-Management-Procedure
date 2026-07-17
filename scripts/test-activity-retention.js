#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
  RETENTION_DAYS,
  activityCutoff,
  recentActivityFilter
} = require('../cloudfunctions/api/common/activity-retention');
const {
  cleanupExpiredActivityLogs,
  countInvalidCreatedAt
} = require('../cloudfunctions/activity-cleanup-worker/retention');
const activityFormat = require('../miniprogram/utils/activity-format');

const root = path.resolve(__dirname, '..');

function createActivityDb(seed) {
  const state = {
    activity_logs: seed.map(item => ({ ...item })),
    touchedCollections: new Set()
  };
  const command = {
    lt(value) { return { operator: 'lt', value }; },
    gte(value) { return { operator: 'gte', value }; }
  };

  function project(row, fields) {
    if (!fields) return { ...row };
    return Object.fromEntries(Object.keys(fields)
      .filter(key => fields[key] && Object.prototype.hasOwnProperty.call(row, key))
      .map(key => [key, row[key]]));
  }

  function query(options = {}) {
    const current = { filter: null, fields: null, skip: 0, limit: 100, ...options };
    return {
      where(filter) { return query({ ...current, filter }); },
      field(fields) { return query({ ...current, fields }); },
      skip(skip) { return query({ ...current, skip }); },
      limit(limit) { return query({ ...current, limit }); },
      async get() {
        let rows = state.activity_logs.slice();
        if (current.filter && current.filter.createdAt) {
          const condition = current.filter.createdAt;
          rows = rows.filter(row => (
            condition.operator === 'lt'
            && row.createdAt instanceof Date
            && row.createdAt.getTime() < condition.value.getTime()
          ));
        }
        return {
          data: rows
            .slice(current.skip, current.skip + current.limit)
            .map(row => project(row, current.fields))
        };
      }
    };
  }

  return {
    state,
    command,
    collection(name) {
      state.touchedCollections.add(name);
      assert.equal(name, 'activity_logs');
      return {
        where(filter) { return query({ filter }); },
        field(fields) { return query({ fields }); },
        doc(id) {
          return {
            async remove() {
              const index = state.activity_logs.findIndex(item => item._id === id);
              if (index < 0) return { stats: { removed: 0 } };
              state.activity_logs.splice(index, 1);
              return { stats: { removed: 1 } };
            }
          };
        }
      };
    }
  };
}

async function run() {
  const now = new Date('2026-07-17T12:00:00.000Z');
  const cutoff = activityCutoff(now);
  assert.equal(RETENTION_DAYS, 30);
  assert.equal(cutoff.toISOString(), '2026-06-17T12:00:00.000Z');

  const command = { gte(value) { return { operator: 'gte', value }; } };
  const recentFilter = recentActivityFilter(command, { operatorId: 'u1' }, now);
  assert.equal(recentFilter.operatorId, 'u1');
  assert.equal(recentFilter.createdAt.operator, 'gte');
  assert.equal(recentFilter.createdAt.value.toISOString(), cutoff.toISOString());

  const rows = [];
  for (let index = 0; index < 251; index += 1) {
    rows.push({
      _id: `old-${index}`,
      createdAt: new Date(cutoff.getTime() - 1000 - index)
    });
  }
  rows.push(
    { _id: 'boundary', createdAt: new Date(cutoff) },
    { _id: 'recent', createdAt: new Date(cutoff.getTime() + 1000) },
    { _id: 'missing-created-at' },
    { _id: 'invalid-created-at', createdAt: 'not-a-cloud-date' }
  );

  const db = createActivityDb(rows);
  const firstCleanup = await cleanupExpiredActivityLogs(db, now, 100);
  assert.equal(firstCleanup.deleted, 251);
  assert.equal(firstCleanup.batches, 3);
  assert.deepEqual(
    db.state.activity_logs.map(item => item._id).sort(),
    ['boundary', 'invalid-created-at', 'missing-created-at', 'recent']
  );
  assert.deepEqual([...db.state.touchedCollections], ['activity_logs']);

  const secondCleanup = await cleanupExpiredActivityLogs(db, now, 100);
  assert.equal(secondCleanup.deleted, 0);
  assert.equal(secondCleanup.batches, 0);
  assert.equal(await countInvalidCreatedAt(db, 2), 2);

  const localNow = new Date(2026, 6, 17, 12, 0, 0);
  const todayA = { id: 'a', createdAt: new Date(2026, 6, 17, 10, 0, 0).toISOString() };
  const todayB = { id: 'b', createdAt: new Date(2026, 6, 17, 9, 0, 0).toISOString() };
  const yesterday = { id: 'c', createdAt: new Date(2026, 6, 16, 18, 0, 0).toISOString() };
  const ordinary = { id: 'd', createdAt: new Date(2026, 6, 10, 8, 0, 0).toISOString() };

  assert.equal(activityFormat.localDateKey(todayA.createdAt), '2026-07-17');
  assert.equal(activityFormat.formatDateLabel(todayA.createdAt, localNow), '今天');
  assert.equal(activityFormat.formatDateLabel(yesterday.createdAt, localNow), '昨天');
  assert.match(activityFormat.formatDateLabel(ordinary.createdAt, localNow), /^7月10日 周[日一二三四五六]$/);

  const merged = activityFormat.mergeUniqueLogs(
    [todayA, yesterday],
    [todayB, { ...yesterday, title: 'updated' }, ordinary]
  );
  assert.equal(merged.length, 4);
  assert.equal(merged.filter(item => item.id === 'c').length, 1);

  const groups = activityFormat.groupLogsByDay(merged, localNow);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].key, '2026-07-17');
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].items.map(item => item.id), ['a', 'b']);
  assert.equal(activityFormat.resolveExpandedDateKey(groups, '', true), '2026-07-17');
  assert.equal(activityFormat.resolveExpandedDateKey(groups, '2026-07-16', false), '2026-07-16');
  assert.equal(activityFormat.resolveExpandedDateKey(groups, '2026-07-16', true), '2026-07-17');
  assert.equal(activityFormat.resolveExpandedDateKey(groups, '', false), '');

  const activitySource = fs.readFileSync(
    path.join(root, 'cloudfunctions/api/modules/activity/index.js'),
    'utf8'
  );
  assert.doesNotMatch(activitySource, /payload\.(startAt|endAt)/);
  assert.equal((activitySource.match(/recentActivityFilter\(/g) || []).length, 2);

  const pageSource = fs.readFileSync(
    path.join(root, 'miniprogram/pages/activity/activity.js'),
    'utf8'
  );
  assert.match(pageSource, /aFmt\.mergeUniqueLogs/);
  assert.match(pageSource, /expandedDateKey/);
  assert.match(pageSource, /toggleDateGroup/);

  console.log('PASS 30-day activity query boundary');
  console.log('PASS paged and idempotent activity cleanup');
  console.log('PASS invalid createdAt records are retained and counted');
  console.log('PASS local-day grouping and cross-page deduplication');
  console.log('PASS latest-day expansion state rules');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
