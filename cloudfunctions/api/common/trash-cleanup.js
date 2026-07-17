'use strict';

const { getAll } = require('./query');

const DELETE_PAGE_SIZE = 100;
const DELETE_CONCURRENCY = 20;
const EMPTY_COUNTS = Object.freeze({
  projects: 0,
  tasks: 0,
  groups: 0,
  reminders: 0,
  activities: 0
});

class CascadeDeleteError extends Error {
  constructor(collection, cause, counts) {
    super('Failed to permanently delete ' + collection);
    this.name = 'CascadeDeleteError';
    this.collection = collection;
    this.cause = cause;
    this.counts = { ...EMPTY_COUNTS, ...(counts || {}) };
  }
}

function emptyCounts() {
  return { ...EMPTY_COUNTS };
}

function mergeCounts(target, source) {
  for (const key of Object.keys(EMPTY_COUNTS)) {
    target[key] = (Number(target[key]) || 0) + (Number(source && source[key]) || 0);
  }
  return target;
}

function uniqueRows(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || !row._id || seen.has(row._id)) return false;
    seen.add(row._id);
    return true;
  });
}

function removeResultCount(result) {
  if (result && result.stats && Number.isFinite(result.stats.removed)) return result.stats.removed;
  if (result && Number.isFinite(result.deleted)) return result.deleted;
  if (result && Number.isFinite(result.removed)) return result.removed;
  return 1;
}

async function removeIds(collection, ids) {
  let removed = 0;
  for (let offset = 0; offset < ids.length; offset += DELETE_CONCURRENCY) {
    const chunk = ids.slice(offset, offset + DELETE_CONCURRENCY);
    const results = await Promise.all(chunk.map(id => collection.doc(id).remove()));
    removed += results.reduce((sum, result) => sum + removeResultCount(result), 0);
  }
  return removed;
}

async function deleteWherePaged(db, collectionName, filter) {
  const collection = db.collection(collectionName);
  let removed = 0;

  while (true) {
    const result = await collection.where(filter).field({ _id: true }).limit(DELETE_PAGE_SIZE).get();
    const ids = (result.data || []).map(item => item && item._id).filter(Boolean);
    if (!ids.length) break;
    const pageRemoved = await removeIds(collection, ids);
    removed += pageRemoved;
    if (pageRemoved === 0) {
      const confirmation = await collection.where(filter).field({ _id: true }).limit(1).get();
      if (!(confirmation.data || []).length) break;
      throw new Error('Paged delete made no progress for ' + collectionName);
    }
  }

  return removed;
}

async function deleteWhereFiltered(db, collectionName, filter, predicate) {
  const collection = db.collection(collectionName);
  const rows = await getAll(collection.where(filter).field({
    _id: true,
    projectId: true,
    taskId: true,
    ownerId: true,
    operatorId: true
  }));
  const ids = rows.filter(predicate).map(item => item && item._id).filter(Boolean);
  return removeIds(collection, ids);
}

async function deleteCollection(counts, key, db, collectionName, filter) {
  try {
    counts[key] += await deleteWherePaged(db, collectionName, filter);
  } catch (error) {
    throw new CascadeDeleteError(collectionName, error, counts);
  }
}

async function deleteCollectionFiltered(counts, key, db, collectionName, filter, predicate) {
  try {
    counts[key] += await deleteWhereFiltered(db, collectionName, filter, predicate);
  } catch (error) {
    throw new CascadeDeleteError(collectionName, error, counts);
  }
}

async function deleteDocument(counts, key, db, collectionName, documentId) {
  try {
    const result = await db.collection(collectionName).doc(documentId).remove();
    counts[key] += removeResultCount(result);
  } catch (error) {
    throw new CascadeDeleteError(collectionName, error, counts);
  }
}

async function deleteKnownIds(counts, key, db, collectionName, ids) {
  try {
    counts[key] += await removeIds(
      db.collection(collectionName),
      [...new Set((ids || []).filter(Boolean))]
    );
  } catch (error) {
    throw new CascadeDeleteError(collectionName, error, counts);
  }
}

async function listByFieldValues(db, collectionName, fieldName, values, fields) {
  const rows = [];
  const uniqueValues = [...new Set((values || []).filter(Boolean))];

  for (let offset = 0; offset < uniqueValues.length; offset += DELETE_CONCURRENCY) {
    const chunk = uniqueValues.slice(offset, offset + DELETE_CONCURRENCY);
    let query = db.collection(collectionName).where({
      [fieldName]: db.command.in(chunk)
    });
    if (fields) query = query.field(fields);
    rows.push(...await getAll(query));
  }

  return uniqueRows(rows);
}

async function purgeProjectData(db, options) {
  const { projectId, ownerId, verifiedOwner = false, removeProject = true } = options;
  const counts = emptyCounts();
  const ownerFilter = verifiedOwner ? {} : { ownerId };
  const activityOwnerFilter = verifiedOwner ? {} : { operatorId: ownerId };

  await deleteCollectionFiltered(
    counts,
    'reminders',
    db,
    'reminders',
    { ownerId },
    reminder => reminder.projectId === projectId
  );
  await deleteCollection(counts, 'activities', db, 'activity_logs', { projectId, ...activityOwnerFilter });
  await deleteCollection(counts, 'groups', db, 'project_groups', { projectId, ...ownerFilter });
  await deleteCollection(counts, 'tasks', db, 'tasks', { projectId, ...ownerFilter });

  if (removeProject) {
    await deleteDocument(counts, 'projects', db, 'projects', projectId);
  }

  return counts;
}

async function purgeTaskData(db, options) {
  const { taskId, projectId, ownerId } = options;
  const counts = emptyCounts();
  await deleteCollectionFiltered(
    counts,
    'reminders',
    db,
    'reminders',
    { ownerId },
    reminder => reminder.taskId === taskId
  );
  await deleteCollectionFiltered(
    counts,
    'activities',
    db,
    'activity_logs',
    projectId ? { projectId } : { operatorId: ownerId },
    activity => activity.taskId === taskId && activity.operatorId === ownerId
  );
  await deleteDocument(counts, 'tasks', db, 'tasks', taskId);
  return counts;
}

async function clearOwnedTrash(db, ownerId) {
  const counts = emptyCounts();
  try {
    const deletedProjects = await listOwnedDeletedProjects(db, ownerId);
    const projectIds = deletedProjects.map(project => project._id).filter(Boolean);
    const projectIdSet = new Set(projectIds);

    const [projectTasks, groups, projectActivities, deletedTasks, ownedReminders] = await Promise.all([
      listByFieldValues(db, 'tasks', 'projectId', projectIds, {
        _id: true,
        projectId: true
      }),
      listByFieldValues(db, 'project_groups', 'projectId', projectIds, {
        _id: true,
        projectId: true
      }),
      listByFieldValues(db, 'activity_logs', 'projectId', projectIds, {
        _id: true,
        projectId: true,
        taskId: true,
        operatorId: true
      }),
      getAll(db.collection('tasks').where({
        ownerId,
        deletedAt: db.command.neq(null)
      }).field({
        _id: true,
        projectId: true,
        ownerId: true,
        deletedAt: true
      })),
      getAll(db.collection('reminders').where({ ownerId }).field({
        _id: true,
        projectId: true,
        taskId: true
      }))
    ]);

    const taskRows = uniqueRows([
      ...projectTasks,
      ...deletedTasks.filter(task => task && task.deletedAt)
    ]);
    const taskIds = taskRows.map(task => task._id);
    const taskIdSet = new Set(taskIds);
    const standaloneTaskIds = deletedTasks
      .filter(task => task && task.deletedAt && !projectIdSet.has(task.projectId))
      .map(task => task._id);
    const standaloneTaskIdSet = new Set(standaloneTaskIds);
    const standaloneActivities = standaloneTaskIds.length
      ? await getAll(db.collection('activity_logs').where({ operatorId: ownerId }).field({
        _id: true,
        projectId: true,
        taskId: true,
        operatorId: true
      }))
      : [];
    const activities = uniqueRows([
      ...projectActivities,
      ...standaloneActivities.filter(activity => (
        activity
        && activity.operatorId === ownerId
        && standaloneTaskIdSet.has(activity.taskId)
      ))
    ]);
    const reminders = ownedReminders.filter(reminder => (
      reminder
      && (projectIdSet.has(reminder.projectId) || taskIdSet.has(reminder.taskId))
    ));

    await deleteKnownIds(counts, 'reminders', db, 'reminders', reminders.map(item => item._id));
    await deleteKnownIds(counts, 'activities', db, 'activity_logs', activities.map(item => item._id));
    await deleteKnownIds(counts, 'groups', db, 'project_groups', groups.map(item => item._id));
    await deleteKnownIds(counts, 'tasks', db, 'tasks', taskIds);
    await deleteKnownIds(counts, 'projects', db, 'projects', projectIds);

    return counts;
  } catch (error) {
    if (error instanceof CascadeDeleteError) {
      error.counts = mergeCounts(counts, error.counts);
    } else {
      error.counts = { ...counts };
    }
    throw error;
  }
}

function dateTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function deletedProjectTimestamp(project) {
  return dateTimestamp(project.deletedAt)
    ?? dateTimestamp(project.updatedAt)
    ?? dateTimestamp(project.createdAt)
    ?? 0;
}

function sortDeletedProjectsOldestFirst(projects) {
  return (Array.isArray(projects) ? projects : []).slice().sort((left, right) => {
    const time = deletedProjectTimestamp(left) - deletedProjectTimestamp(right);
    return time || String(left._id || '').localeCompare(String(right._id || ''));
  });
}

async function listOwnedDeletedProjects(db, ownerId) {
  const rows = await getAll(db.collection('projects').where({
    ownerId,
    deletedAt: db.command.neq(null)
  }));
  return rows.filter(project => project && project.deletedAt);
}

async function enforceProjectTrashLimit(db, ownerId, limit = 100) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  const counts = emptyCounts();
  let purgedProjectCount = 0;

  for (let pass = 0; pass < 5; pass += 1) {
    const deletedProjects = sortDeletedProjectsOldestFirst(
      await listOwnedDeletedProjects(db, ownerId)
    );
    if (deletedProjects.length <= safeLimit) {
      return { purgedProjectCount, counts, retainedProjectCount: deletedProjects.length };
    }

    const overflow = deletedProjects.slice(0, deletedProjects.length - safeLimit);
    for (const project of overflow) {
      const removed = await purgeProjectData(db, {
        projectId: project._id,
        ownerId,
        verifiedOwner: true
      });
      mergeCounts(counts, removed);
      purgedProjectCount += removed.projects;
    }
  }

  throw new Error('Project trash retention did not converge');
}

module.exports = {
  CascadeDeleteError,
  clearOwnedTrash,
  deleteWhereFiltered,
  deleteWherePaged,
  emptyCounts,
  enforceProjectTrashLimit,
  listByFieldValues,
  listOwnedDeletedProjects,
  mergeCounts,
  purgeProjectData,
  purgeTaskData,
  sortDeletedProjectsOldestFirst
};
