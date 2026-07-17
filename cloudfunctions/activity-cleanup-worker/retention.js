'use strict';

const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const DELETE_CONCURRENCY = 20;

function activityCutoff(now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError('now must be a valid date');
  return new Date(current.getTime() - RETENTION_DAYS * DAY_MS);
}

function isValidCreatedAt(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function removedCount(result) {
  if (result && result.stats && Number.isFinite(result.stats.removed)) return result.stats.removed;
  if (result && Number.isFinite(result.removed)) return result.removed;
  if (result && Number.isFinite(result.deleted)) return result.deleted;
  return 1;
}

async function removeIds(collection, ids) {
  let removed = 0;
  for (let offset = 0; offset < ids.length; offset += DELETE_CONCURRENCY) {
    const chunk = ids.slice(offset, offset + DELETE_CONCURRENCY);
    const results = await Promise.all(chunk.map(id => collection.doc(id).remove()));
    removed += results.reduce((sum, result) => sum + removedCount(result), 0);
  }
  return removed;
}

async function cleanupExpiredActivityLogs(db, now = new Date(), batchSize = DEFAULT_BATCH_SIZE) {
  const safeBatchSize = Math.min(100, Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE));
  const cutoff = activityCutoff(now);
  const collection = db.collection('activity_logs');
  let deleted = 0;
  let batches = 0;

  while (true) {
    const result = await collection.where({
      createdAt: db.command.lt(cutoff)
    }).field({ _id: true }).limit(safeBatchSize).get();
    const ids = (result.data || []).map(item => item && item._id).filter(Boolean);
    if (!ids.length) break;

    const pageDeleted = await removeIds(collection, ids);
    deleted += pageDeleted;
    batches += 1;

    if (pageDeleted === 0) {
      const remaining = await collection.where({
        createdAt: db.command.lt(cutoff)
      }).field({ _id: true }).limit(1).get();
      if ((remaining.data || []).length) {
        throw new Error('Activity cleanup made no progress');
      }
      break;
    }
  }

  return {
    cutoff: cutoff.toISOString(),
    deleted,
    batches
  };
}

async function countInvalidCreatedAt(db, batchSize = DEFAULT_BATCH_SIZE) {
  const safeBatchSize = Math.min(100, Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE));
  const query = db.collection('activity_logs').field({ _id: true, createdAt: true });
  let offset = 0;
  let invalidCreatedAt = 0;

  while (true) {
    const result = await query.skip(offset).limit(safeBatchSize).get();
    const rows = result.data || [];
    invalidCreatedAt += rows.filter(row => !isValidCreatedAt(row && row.createdAt)).length;
    if (rows.length < safeBatchSize) break;
    offset += rows.length;
  }

  return invalidCreatedAt;
}

module.exports = {
  DAY_MS,
  DEFAULT_BATCH_SIZE,
  RETENTION_DAYS,
  activityCutoff,
  cleanupExpiredActivityLogs,
  countInvalidCreatedAt,
  isValidCreatedAt
};
