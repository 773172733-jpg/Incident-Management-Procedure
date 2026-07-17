const cloud = require('wx-server-sdk');

let _db = null;
function getDb() {
  if (!_db) {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    _db = cloud.database();
  }
  return _db;
}

const auth = require('../../common/auth');
const { success, fail } = require('../../common/response');
const {
  FEEDBACK_STATUS,
  normalizeFeedbackPayload,
  checkFeedbackRateLimit
} = require('../../common/feedback');

async function create(payload, context) {
  try {
    const ownerId = auth.getUserId(context);
    if (!ownerId) return fail('UNAUTHORIZED', '无法获取用户身份');

    const normalized = normalizeFeedbackPayload(payload || {});
    if (normalized.error) return fail('INVALID_PARAMS', normalized.error);

    const db = getDb();
    const now = new Date();
    const limit = await checkFeedbackRateLimit(db, ownerId, now);
    if (limit.limited) return fail('RATE_LIMITED', '提交太频繁，请稍后再试');

    const data = {
      ownerId,
      category: normalized.data.category,
      content: normalized.data.content,
      status: FEEDBACK_STATUS.PENDING,
      appVersion: normalized.data.appVersion,
      createdAt: now,
      updatedAt: now
    };

    const result = await db.collection('feedbacks').add({ data });
    return success({ feedbackId: result._id }, '反馈已提交，感谢你的建议');
  } catch (err) {
    console.error('[feedback.create] failed', JSON.stringify({
      message: err && err.message,
      code: err && err.code,
      errCode: err && err.errCode
    }));
    return fail('INTERNAL_ERROR', '反馈提交失败，请稍后重试');
  }
}

module.exports = { create };
