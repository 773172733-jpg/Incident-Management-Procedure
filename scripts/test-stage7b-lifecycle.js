#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
  allBranchesCompleted,
  summarizeProjectTasks,
  isEndedArchivedProject,
  isReopenableEndedProject,
  buildCompletionArchiveState,
  buildReopenedProjectState,
  statusBeforeParentClose,
  withProjectCompletionState
} = require('../cloudfunctions/api/common/project-state');
const {
  loadProjectProgressStats
} = require('../cloudfunctions/api/common/project-progress');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function task(status, extra = {}) {
  return { status, deletedAt: null, ...extra };
}

function createStatsDb(rows) {
  const state = { reads: 0 };
  const command = {
    eq(value) { return { operator: 'eq', value }; }
  };
  function query(options = {}) {
    const current = { skip: 0, limit: 100, fields: null, ...options };
    return {
      field(fields) { return query({ ...current, fields }); },
      skip(skip) { return query({ ...current, skip }); },
      limit(limit) { return query({ ...current, limit }); },
      async get() {
        state.reads += 1;
        const page = rows
          .filter(row => row.ownerId === 'u1' && row.deletedAt === null)
          .slice(current.skip, current.skip + current.limit)
          .map(row => {
            if (!current.fields) return { ...row };
            return Object.fromEntries(Object.keys(current.fields)
              .filter(key => current.fields[key] && Object.prototype.hasOwnProperty.call(row, key))
              .map(key => [key, row[key]]));
          });
        return { data: page };
      }
    };
  }
  return {
    state,
    command,
    collection() {
      return { where() { return query(); } };
    }
  };
}

async function run() {
  assert.equal(allBranchesCompleted(0, 0), false);
  assert.equal(summarizeProjectTasks([]).allBranchesCompleted, false);
  assert.equal(summarizeProjectTasks([
    task('completed'),
    task('todo')
  ]).allBranchesCompleted, false);

  const allCompleted = summarizeProjectTasks([
    task('completed'),
    task('completed'),
    task('todo', { deletedAt: new Date() }),
    task('cancelled')
  ]);
  assert.deepEqual(allCompleted, {
    taskCount: 2,
    completedTaskCount: 2,
    progress: 100,
    allBranchesCompleted: true
  });

  const closedByParent = summarizeProjectTasks([
    task('completed'),
    task('closed_by_parent')
  ]);
  assert.equal(closedByParent.completedTaskCount, 1);
  assert.equal(closedByParent.allBranchesCompleted, false);

  const approved = summarizeProjectTasks([task('approved')]);
  assert.equal(approved.completedTaskCount, 0);
  assert.equal(approved.allBranchesCompleted, false);

  const reopened = summarizeProjectTasks([
    task('completed'),
    task('todo')
  ]);
  assert.equal(reopened.allBranchesCompleted, false);

  const decorated = withProjectCompletionState({
    _id: 'p1',
    taskCountCache: 99,
    completedTaskCountCache: 99,
    progressCache: 100
  }, closedByParent);
  assert.equal(decorated.taskCountCache, 2);
  assert.equal(decorated.completedTaskCountCache, 1);
  assert.equal(decorated.taskCount, 2);
  assert.equal(decorated.completedTaskCount, 1);
  assert.equal(decorated.progressCache, 50);
  assert.equal(decorated.allBranchesCompleted, false);

  const now = new Date('2026-07-17T12:00:00+08:00');
  const ended = buildCompletionArchiveState(now, 'owner', true);
  assert.equal(ended.status, 'archived');
  assert.equal(ended.completedEarly, true);
  assert.equal(ended.completedAt, now);
  assert.equal(ended.archivedAt, now);
  assert.equal(isEndedArchivedProject(ended), true);
  assert.equal(isReopenableEndedProject(ended), true);
  assert.equal(isReopenableEndedProject({ status: 'archived', completedAt: null }), false);
  assert.equal(isReopenableEndedProject({ status: 'completed' }), true);

  assert.deepEqual(buildReopenedProjectState(now), {
    status: 'active',
    completedAt: null,
    completedBy: null,
    completedEarly: false,
    archivedAt: null,
    updatedAt: now
  });
  assert.equal(statusBeforeParentClose({ statusBeforeParentClose: 'doing' }), 'doing');
  assert.equal(statusBeforeParentClose({}), 'todo');

  const statsDb = createStatsDb([
    { _id: 't1', ownerId: 'u1', projectId: 'p1', status: 'completed', deletedAt: null },
    { _id: 't2', ownerId: 'u1', projectId: 'p1', status: 'completed', deletedAt: null },
    { _id: 't3', ownerId: 'u1', projectId: 'p2', status: 'closed_by_parent', deletedAt: null },
    { _id: 't4', ownerId: 'u1', projectId: 'other', status: 'completed', deletedAt: null }
  ]);
  const projectStats = await loadProjectProgressStats(statsDb, 'u1', [
    { _id: 'p1' },
    { _id: 'p2' }
  ]);
  assert.equal(statsDb.state.reads, 1);
  assert.equal(projectStats[0].allBranchesCompleted, true);
  assert.equal(projectStats[1].allBranchesCompleted, false);

  const homeSource = read('miniprogram/pages/home/home.js');
  assert.match(homeSource, /excludeArchived:\s*true/);
  assert.match(homeSource, /includeTaskStats:\s*true/);
  assert.equal((homeSource.match(/tasks\.listByProject\s*\(/g) || []).length, 1);

  const projectSource = read('cloudfunctions/api/modules/project/index.js');
  assert.match(projectSource, /loadProjectProgressStats\(db,\s*openid,\s*projects\)/);
  assert.match(projectSource, /buildCompletionArchiveState\(now,\s*openid,\s*hasIncomplete\)/);
  assert.match(projectSource, /buildReopenedProjectState\(db\.serverDate\(\)\)/);
  assert.match(projectSource, /alreadyCompleted:\s*true/);
  assert.match(projectSource, /alreadyReopened:\s*true/);
  assert.doesNotMatch(projectSource, /action:\s*'task\.closed_by_parent'/);
  assert.doesNotMatch(projectSource, /syncWechatSubscription/);

  const archiveSource = read('miniprogram/pages/archive/archive.js');
  assert.match(archiveSource, /projectService\.reopen\(item\._id\)/);

  console.log('PASS stage 7B completion and archive lifecycle');
  console.log('PASS homepage initial task stats use one batch action');
  console.log('PASS closed_by_parent and approved are not true completion');
  console.log('PASS completion archives and reopen clears archive state');
  console.log('PASS duplicate completion and reopen guards are present');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
