'use strict';

const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function activityCutoff(now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError('now must be a valid date');
  return new Date(current.getTime() - RETENTION_DAYS * DAY_MS);
}

function recentActivityFilter(command, filter = {}, now = new Date()) {
  return {
    ...filter,
    createdAt: command.gte(activityCutoff(now))
  };
}

module.exports = {
  DAY_MS,
  RETENTION_DAYS,
  activityCutoff,
  recentActivityFilter
};
