'use strict';

const cloud = require('wx-server-sdk');
const {
  cleanupExpiredActivityLogs,
  countInvalidCreatedAt
} = require('./retention');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  try {
    const now = new Date();
    const cleanup = await cleanupExpiredActivityLogs(db, now);
    const invalidCreatedAt = await countInvalidCreatedAt(db);
    const result = { ...cleanup, invalidCreatedAt };

    console.log('[activity-cleanup-worker] completed:', JSON.stringify(result));
    if (invalidCreatedAt > 0) {
      console.warn('[activity-cleanup-worker] invalid createdAt records:', invalidCreatedAt);
    }
    return result;
  } catch (error) {
    console.error('[activity-cleanup-worker] failed:', error && error.message);
    throw error;
  }
};
