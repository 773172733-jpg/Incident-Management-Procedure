#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const {
  allBranchesCompleted,
  isProjectInTrash
} = require('../cloudfunctions/api/common/project-state');
const {
  buildTaskPreview
} = require('../cloudfunctions/api/common/task-preview');
const {
  clearOwnedTrash,
  enforceProjectTrashLimit,
  purgeProjectData,
  purgeTaskData,
  sortDeletedProjectsOldestFirst
} = require('../cloudfunctions/api/common/trash-cleanup');

function matches(row, filter) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (expected && expected.__operator === 'neq') return row[key] !== expected.value;
    if (expected && expected.__operator === 'in') return expected.values.includes(row[key]);
    return row[key] === expected;
  });
}

class Query {
  constructor(db, name, filter = {}, options = {}) {
    this.db = db;
    this.name = name;
    this.filter = filter;
    this.options = { skip: 0, limit: 100, fields: null, ...options };
  }

  clone(patch) {
    return new Query(this.db, this.name, this.filter, { ...this.options, ...patch });
  }

  skip(value) { return this.clone({ skip: value }); }
  limit(value) { return this.clone({ limit: value }); }
  field(fields) { return this.clone({ fields }); }

  async get() {
    const rows = this.db.rows[this.name]
      .filter(row => matches(row, this.filter))
      .slice(this.options.skip, this.options.skip + this.options.limit)
      .map(row => {
        if (!this.options.fields) return { ...row };
        const projected = {};
        for (const [key, enabled] of Object.entries(this.options.fields)) {
          if (enabled && Object.prototype.hasOwnProperty.call(row, key)) projected[key] = row[key];
        }
        return projected;
      });
    return { data: rows };
  }
}

class Collection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  where(filter) { return new Query(this.db, this.name, filter); }

  doc(id) {
    return {
      remove: async () => {
        const before = this.db.rows[this.name].length;
        this.db.rows[this.name] = this.db.rows[this.name].filter(row => row._id !== id);
        return { stats: { removed: before - this.db.rows[this.name].length } };
      }
    };
  }
}

function createDb(seed = {}) {
  const names = ['projects', 'tasks', 'project_groups', 'reminders', 'activity_logs'];
  const rows = Object.fromEntries(names.map(name => [
    name,
    (seed[name] || []).map(item => ({ ...item }))
  ]));
  return {
    rows,
    command: {
      neq(value) { return { __operator: 'neq', value }; },
      in(values) { return { __operator: 'in', values }; }
    },
    collection(name) {
      if (!rows[name]) rows[name] = [];
      return new Collection(this, name);
    }
  };
}

function task(id, status, priority, createdAt, extra = {}) {
  return {
    _id: id,
    projectId: 'p1',
    ownerId: 'u1',
    title: id,
    status,
    priority,
    createdAt,
    deletedAt: null,
    ...extra
  };
}

async function run() {
  const preview = buildTaskPreview([
    task('completed-core', 'completed', 'core', '2026-01-01'),
    task('todo-optional', 'todo', 'optional', '2026-01-01'),
    task('todo-core-new', 'todo', 'core', '2026-01-03'),
    task('closed-core', 'closed_by_parent', 'core', '2026-01-02'),
    task('todo-core-old', 'todo', 'core', '2026-01-01'),
    task('approved-important', 'approved', 'important', '2026-01-01'),
    task('doing-important', 'doing', 'important', '2026-01-01'),
    task('cancelled', 'cancelled', 'core', '2025-01-01'),
    task('deleted', 'todo', 'core', '2025-01-01', { deletedAt: new Date() })
  ], 6);
  assert.equal(preview.tasks.length, 6);
  assert.deepEqual(preview.tasks.slice(0, 5).map(item => item._id), [
    'todo-core-old',
    'closed-core',
    'todo-core-new',
    'approved-important',
    'doing-important',
  ]);
  assert.equal(preview.tasks[5]._id, 'todo-optional');
  assert.equal(preview.totalTaskCount, 7);
  assert.equal(preview.completedTaskCount, 1);
  assert.equal(preview.unfinishedTaskCount, 6);
  assert.equal(preview.hasMore, true);

  assert.equal(allBranchesCompleted(0, 0), false);
  assert.equal(allBranchesCompleted(3, 3), true);
  assert.equal(allBranchesCompleted(3, 2), false);
  assert.equal(isProjectInTrash({ deletedAt: null }), false);
  assert.equal(isProjectInTrash({ deletedAt: new Date() }), true);

  const cascadeDb = createDb({
    projects: [
      { _id: 'p1', ownerId: 'u1', deletedAt: new Date('2026-01-01') },
      { _id: 'other', ownerId: 'u1', deletedAt: null }
    ],
    tasks: [
      ...Array.from({ length: 251 }, (_, index) => ({
        _id: 't' + index,
        projectId: 'p1',
        ownerId: 'u1',
        deletedAt: index % 2 ? null : new Date()
      })),
      { _id: 'other-task', projectId: 'other', ownerId: 'u1', deletedAt: null }
    ],
    project_groups: [
      { _id: 'g1', projectId: 'p1', ownerId: 'u1' },
      { _id: 'other-group', projectId: 'other', ownerId: 'u1' }
    ],
    reminders: [
      { _id: 'r-in-app', projectId: 'p1', taskId: 't1', ownerId: 'u1', channel: 'in_app' },
      { _id: 'r-wechat', projectId: 'p1', taskId: 't1', ownerId: 'u1', channel: 'wechat_subscription' },
      { _id: 'other-reminder', projectId: 'other', taskId: 'other-task', ownerId: 'u1' }
    ],
    activity_logs: [
      { _id: 'a1', projectId: 'p1', taskId: 't1', operatorId: 'u1' },
      { _id: 'other-activity', projectId: 'other', taskId: 'other-task', operatorId: 'u1' }
    ]
  });
  const cascade = await purgeProjectData(cascadeDb, {
    projectId: 'p1',
    ownerId: 'u1',
    verifiedOwner: true
  });
  assert.deepEqual(cascade, {
    projects: 1,
    tasks: 251,
    groups: 1,
    reminders: 2,
    activities: 1
  });
  assert.equal(cascadeDb.rows.projects.some(row => row._id === 'p1'), false);
  assert.equal(cascadeDb.rows.tasks.some(row => row.projectId === 'p1'), false);
  assert.equal(cascadeDb.rows.reminders.some(row => row.projectId === 'p1'), false);
  assert.equal(cascadeDb.rows.projects.some(row => row._id === 'other'), true);

  const repeated = await purgeProjectData(cascadeDb, {
    projectId: 'p1',
    ownerId: 'u1',
    verifiedOwner: true
  });
  assert.deepEqual(repeated, {
    projects: 0,
    tasks: 0,
    groups: 0,
    reminders: 0,
    activities: 0
  });

  const taskPurgeDb = createDb();
  const emptyTaskPurge = await purgeTaskData(taskPurgeDb, {
    taskId: 'missing',
    projectId: 'p1',
    ownerId: 'u1'
  });
  assert.deepEqual(emptyTaskPurge, {
    projects: 0,
    tasks: 0,
    groups: 0,
    reminders: 0,
    activities: 0
  });

  const emptyTrash = await clearOwnedTrash(createDb(), 'u1');
  assert.deepEqual(emptyTrash, {
    projects: 0,
    tasks: 0,
    groups: 0,
    reminders: 0,
    activities: 0
  });

  const clearDb = createDb({
    projects: [{ _id: 'clear-project', ownerId: 'u1', deletedAt: new Date() }],
    tasks: [
      ...Array.from({ length: 205 }, (_, index) => ({
        _id: 'clear-child-' + index,
        projectId: 'clear-project',
        ownerId: 'u1',
        deletedAt: null
      })),
      { _id: 'clear-standalone', projectId: 'active-project', ownerId: 'u1', deletedAt: new Date() }
    ],
    reminders: [
      { _id: 'clear-in-app', projectId: 'clear-project', taskId: 'clear-child-1', ownerId: 'u1', channel: 'in_app' },
      { _id: 'clear-wechat', projectId: 'active-project', taskId: 'clear-standalone', ownerId: 'u1', channel: 'wechat_subscription' }
    ],
    activity_logs: [
      { _id: 'clear-project-log', projectId: 'clear-project', operatorId: 'u1' },
      { _id: 'clear-task-log', projectId: 'active-project', taskId: 'clear-standalone', operatorId: 'u1' }
    ]
  });
  const cleared = await clearOwnedTrash(clearDb, 'u1');
  assert.deepEqual(cleared, {
    projects: 1,
    tasks: 206,
    groups: 0,
    reminders: 2,
    activities: 2
  });
  assert.equal(clearDb.rows.projects.length, 0);
  assert.equal(clearDb.rows.tasks.length, 0);
  assert.equal(clearDb.rows.reminders.length, 0);

  const bulkProjectDb = createDb({
    projects: Array.from({ length: 25 }, (_, index) => ({
      _id: 'bulk-project-' + index,
      ownerId: 'u1',
      deletedAt: new Date()
    })),
    tasks: Array.from({ length: 25 }, (_, index) => ({
      _id: 'bulk-task-' + index,
      projectId: 'bulk-project-' + index,
      ownerId: 'u1',
      deletedAt: null
    })),
    project_groups: Array.from({ length: 25 }, (_, index) => ({
      _id: 'bulk-group-' + index,
      projectId: 'bulk-project-' + index,
      ownerId: 'u1'
    }))
  });
  const bulkCleared = await clearOwnedTrash(bulkProjectDb, 'u1');
  assert.deepEqual(bulkCleared, {
    projects: 25,
    tasks: 25,
    groups: 25,
    reminders: 0,
    activities: 0
  });
  assert.equal(bulkProjectDb.rows.projects.length, 0);
  assert.equal(bulkProjectDb.rows.tasks.length, 0);
  assert.equal(bulkProjectDb.rows.project_groups.length, 0);

  const retentionProjects = Array.from({ length: 101 }, (_, index) => ({
    _id: 'p' + index,
    ownerId: 'u1',
    deletedAt: new Date(Date.UTC(2026, 0, index + 1)),
    updatedAt: new Date(Date.UTC(2026, 0, index + 1))
  }));
  const retentionDb = createDb({
    projects: retentionProjects,
    tasks: Array.from({ length: 30 }, (_, index) => ({
      _id: 'standalone-' + index,
      projectId: 'active-project',
      ownerId: 'u1',
      deletedAt: new Date()
    }))
  });
  const retention = await enforceProjectTrashLimit(retentionDb, 'u1', 100);
  assert.equal(retention.purgedProjectCount, 1);
  assert.equal(retention.retainedProjectCount, 100);
  assert.equal(retentionDb.rows.projects.some(row => row._id === 'p0'), false);
  assert.equal(retentionDb.rows.tasks.length, 30);

  const concurrentRetentionDb = createDb({
    projects: retentionProjects
  });
  await Promise.all([
    enforceProjectTrashLimit(concurrentRetentionDb, 'u1', 100),
    enforceProjectTrashLimit(concurrentRetentionDb, 'u1', 100)
  ]);
  assert.equal(concurrentRetentionDb.rows.projects.length, 100);
  assert.equal(concurrentRetentionDb.rows.projects.some(row => row._id === 'p0'), false);

  const fallbackOrder = sortDeletedProjectsOldestFirst([
    { _id: 'new', deletedAt: '2026-03-01' },
    { _id: 'legacy', deletedAt: 'invalid', updatedAt: '2025-01-01' },
    { _id: 'middle', deletedAt: '2026-02-01' }
  ]);
  assert.deepEqual(fallbackOrder.map(item => item._id), ['legacy', 'middle', 'new']);

  console.log('PASS stage 7A core logic');
  console.log('PASS homepage preview limit and ordering');
  console.log('PASS allBranchesCompleted rules');
  console.log('PASS active project purge guard');
  console.log('PASS paged cascade purge (251 tasks)');
  console.log('PASS purge idempotency and empty cleanup');
  console.log('PASS empty and multi-page trash clearing');
  console.log('PASS bulk clearing across project-id batches');
  console.log('PASS concurrent trash retention keeps newest 100 projects');
  console.log('PASS in_app and wechat_subscription orphan cleanup');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
