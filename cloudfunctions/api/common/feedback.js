const FEEDBACK_CATEGORY = {
  BUG: 'bug',
  SUGGESTION: 'suggestion',
  OTHER: 'other'
};

const FEEDBACK_STATUS = {
  PENDING: 'pending'
};

const FEEDBACK_LIMITS = {
  CONTENT_MIN: 5,
  CONTENT_MAX: 500,
  APP_VERSION_MAX: 32,
  MIN_INTERVAL_MS: 60 * 1000,
  DAILY_MAX: 10
};

const DEFAULT_APP_VERSION = '1.2.0-beta.1';
const DEFAULT_TIMEZONE_OFFSET_MINUTES = 8 * 60;

const ALLOWED_CATEGORIES = new Set(Object.values(FEEDBACK_CATEGORY));

function normalizeFeedbackPayload(payload = {}) {
  const category = payload.category;
  if (!ALLOWED_CATEGORIES.has(category)) {
    return { error: '反馈类型无效' };
  }

  if (typeof payload.content !== 'string') {
    return { error: '请填写反馈内容' };
  }

  const content = payload.content.trim();
  if (content.length < FEEDBACK_LIMITS.CONTENT_MIN) {
    return { error: '请至少填写5个字' };
  }
  if (content.length > FEEDBACK_LIMITS.CONTENT_MAX) {
    return { error: '反馈内容不能超过500个字' };
  }

  let appVersion = DEFAULT_APP_VERSION;
  if (payload.appVersion !== undefined) {
    if (typeof payload.appVersion !== 'string') {
      return { error: '版本信息无效' };
    }
    appVersion = payload.appVersion.trim() || DEFAULT_APP_VERSION;
  }
  if (appVersion.length > FEEDBACK_LIMITS.APP_VERSION_MAX || /[\\/]/.test(appVersion)) {
    return { error: '版本信息无效' };
  }

  return {
    data: {
      category,
      content,
      appVersion
    }
  };
}

function shanghaiDayRange(now = new Date()) {
  const time = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const shifted = new Date(time + DEFAULT_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const startUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
    - DEFAULT_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  return {
    start: new Date(startUtc),
    end: new Date(startUtc + 24 * 60 * 60 * 1000)
  };
}

async function countFeedbacksSince(db, ownerId, since) {
  const _ = db.command;
  const result = await db.collection('feedbacks').where({
    ownerId,
    createdAt: _.gte(since)
  }).count();
  return result.total || 0;
}

async function countFeedbacksInRange(db, ownerId, start, end) {
  const _ = db.command;
  const result = await db.collection('feedbacks').where({
    ownerId,
    createdAt: _.gte(start).and(_.lt(end))
  }).count();
  return result.total || 0;
}

async function checkFeedbackRateLimit(db, ownerId, now = new Date()) {
  const recentSince = new Date(now.getTime() - FEEDBACK_LIMITS.MIN_INTERVAL_MS);
  const recentCount = await countFeedbacksSince(db, ownerId, recentSince);
  if (recentCount >= 1) {
    return { limited: true, reason: 'minute' };
  }

  const range = shanghaiDayRange(now);
  const dayCount = await countFeedbacksInRange(db, ownerId, range.start, range.end);
  if (dayCount >= FEEDBACK_LIMITS.DAILY_MAX) {
    return { limited: true, reason: 'day' };
  }

  return { limited: false };
}

module.exports = {
  FEEDBACK_CATEGORY,
  FEEDBACK_STATUS,
  FEEDBACK_LIMITS,
  DEFAULT_APP_VERSION,
  normalizeFeedbackPayload,
  shanghaiDayRange,
  checkFeedbackRateLimit
};
