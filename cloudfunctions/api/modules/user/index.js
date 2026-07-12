/**
 * 事件树 - 用户模块
 * 包含 bootstrap（初始化/登录）、资料查询和设置更新
 */

const cloud = require('wx-server-sdk');

let _db = null;
function getDb() {
  if (!_db) {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    _db = cloud.database();
    console.log('[user] cloud.init + db ready');
  }
  return _db;
}

const auth = require('../../common/auth');
const { success, fail } = require('../../common/response');

// 延迟加载 logger 避免循环依赖和初始化问题
let _logger = null;
function getLogger() {
  if (!_logger) {
    try {
      _logger = require('../../common/logger');
    } catch (e) {
      console.warn('[user] logger module load failed:', e.message);
      _logger = { writeActivityLog: async () => null };
    }
  }
  return _logger;
}

/**
 * bootstrap - 初始化用户
 * 每次小程序启动时调用
 * 1. 获取当前用户 OPENID
 * 2. 查询 users 集合是否存在
 * 3. 不存在则创建
 * 4. 返回用户信息 + 首页统计
 */
async function bootstrap(payload, context) {
  console.log('[user.bootstrap] start');

  try {
    // 1. 获取 OPENID
    const openid = auth.getUserId(context);
    console.log('[user.bootstrap] wxContext', JSON.stringify({
      hasOpenid: Boolean(openid),
      openidLength: openid ? openid.length : 0
    }));

    if (!openid) {
      return fail('OPENID_UNAVAILABLE', '无法获取当前微信用户身份');
    }

    const db = getDb();
    const _ = db.command;

    // 2. 查询用户
    console.log('[user.bootstrap] query users, openid=' + openid.substring(0, 8) + '...');
    let userResult;
    try {
      userResult = await db.collection('users').where({ openid }).get();
      console.log('[user.bootstrap] existing user count:', userResult.data.length);
    } catch (dbErr) {
      console.error('[user.bootstrap] query users failed', JSON.stringify({
        message: dbErr.message,
        errCode: dbErr.errCode,
        code: dbErr.code
      }));

      if (String(dbErr.errCode).includes('-502005')) {
        return fail('COLLECTION_NOT_FOUND', '缺少数据库集合 users，请先在云开发控制台创建');
      }
      if (String(dbErr.errCode).includes('-502001')) {
        return fail('DATABASE_PERMISSION_DENIED', '数据库权限不足，请检查 users 集合权限设置');
      }
      throw dbErr;
    }

    let user;
    let isNew = false;

    if (userResult.data.length === 0) {
      // 3. 新用户，自动创建
      console.log('[user.bootstrap] creating new user');
      const now = new Date();
      const newUser = {
        openid: openid,
        nickname: '微信用户',
        avatarUrl: '',
        status: 'active',
        plan: 'free',
        planExpiredAt: null,
        defaultReminderMinutes: 30,
        completedTaskSink: true,
        timezone: 'Asia/Shanghai',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1
      };

      try {
        const addResult = await db.collection('users').add({ data: newUser });
        console.log('[user.bootstrap] user created, _id=' + addResult._id);
        newUser._id = addResult._id;
        user = newUser;
        isNew = true;

        // 写入活动日志（失败不阻断）
        try {
          const logger = getLogger();
          await logger.writeActivityLog({
            projectId: '',
            operatorId: openid,
            actorNameSnapshot: '微信用户',
            action: 'user_registered',
            targetType: 'user',
            targetId: addResult._id,
            targetTitleSnapshot: '微信用户',
            metadata: {},
            visibleTo: [openid]
          });
          console.log('[user.bootstrap] activity log written');
        } catch (logErr) {
          console.warn('[user.bootstrap] activity log write failed (non-blocking):', logErr.message);
        }
      } catch (addErr) {
        console.error('[user.bootstrap] create user failed', JSON.stringify({
          message: addErr.message,
          errCode: addErr.errCode,
          code: addErr.code
        }));

        if (String(addErr.errCode).includes('-502005')) {
          return fail('COLLECTION_NOT_FOUND', '缺少数据库集合 users，请先在云开发控制台创建');
        }
        if (String(addErr.errCode).includes('-502001')) {
          return fail('DATABASE_PERMISSION_DENIED', '数据库权限不足，请检查 users 集合权限设置');
        }
        throw addErr;
      }
    } else {
      // 4. 已有用户，更新最后活跃时间
      user = userResult.data[0];
      console.log('[user.bootstrap] existing user, updating lastActive');
      try {
        await db.collection('users').doc(user._id).update({
          data: { updatedAt: new Date() }
        });
      } catch (updateErr) {
        console.warn('[user.bootstrap] update lastActive failed (non-blocking):', updateErr.message);
      }
    }

    // 5. 获取首页统计（失败不阻断）
    let stats = { activeCount: 0, completedCount: 0 };
    try {
      stats = await getDashboardStats(openid, db);
    } catch (statsErr) {
      console.warn('[user.bootstrap] getDashboardStats failed (non-blocking):', statsErr.message);
    }

    console.log('[user.bootstrap] success');
    return success({
      user: sanitizeUser(user),
      isNew: isNew,
      stats: stats
    }, isNew ? '欢迎加入事件树' : '');
  } catch (err) {
    console.error('[user.bootstrap] failed', JSON.stringify({
      message: err && err.message,
      stack: err && err.stack,
      code: err && err.code,
      errCode: err && err.errCode
    }));
    return fail('INTERNAL_ERROR', '服务器错误，请稍后重试');
  }
}

/**
 * getProfile - 获取用户资料
 */
async function getProfile(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');

  const db = getDb();
  const res = await db.collection('users').where({ openid }).get();
  if (res.data.length === 0) {
    return fail('UNAUTHORIZED', '用户不存在');
  }

  return success({ user: sanitizeUser(res.data[0]) });
}

/**
 * updateProfile - 更新用户资料
 */
async function updateProfile(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');

  const { nickname, avatarUrl } = payload;
  const updateData = { updatedAt: new Date() };

  if (nickname !== undefined) updateData.nickname = nickname.trim().substring(0, 32);
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

  const db = getDb();
  const res = await db.collection('users').where({ openid }).update({ data: updateData });
  if (res.stats.updated === 0) {
    return fail('UNAUTHORIZED', '用户不存在');
  }

  return success(null, '资料已更新');
}

/**
 * updateSettings - 更新用户设置
 */
async function updateSettings(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');

  const { defaultReminderMinutes, completedTaskSink } = payload;
  const updateData = { updatedAt: new Date() };

  if (defaultReminderMinutes !== undefined) {
    const valid = [0, 10, 30, 60, 1440];
    if (valid.includes(defaultReminderMinutes)) {
      updateData.defaultReminderMinutes = defaultReminderMinutes;
    }
  }
  if (completedTaskSink !== undefined) {
    updateData.completedTaskSink = !!completedTaskSink;
  }

  const db = getDb();
  await db.collection('users').where({ openid }).update({ data: updateData });
  return success(null, '设置已更新');
}

/**
 * 首页统计（失败不阻断）
 */
async function getDashboardStats(openid, db) {
  const _ = db.command;
  const baseFilter = { ownerId: openid, deletedAt: _.eq(null) };

  let activeCount = 0;
  let completedCount = 0;

  try {
    const activeResult = await db.collection('projects').where({
      ownerId: openid,
      deletedAt: _.eq(null),
      status: 'active'
    }).count();
    activeCount = activeResult.total;
  } catch (e) {
    console.warn('[user.bootstrap] count active projects failed:', e.message);
  }

  try {
    const completedResult = await db.collection('projects').where({
      ownerId: openid,
      deletedAt: _.eq(null),
      status: 'completed'
    }).count();
    completedCount = completedResult.total;
  } catch (e) {
    console.warn('[user.bootstrap] count completed projects failed:', e.message);
  }

  return { activeCount, completedCount };
}

/** 脱敏用户信息（移除敏感字段） */
function sanitizeUser(user) {
  if (!user) return null;
  const { openid, ...safe } = user;
  return safe;
}

module.exports = { bootstrap, getProfile, updateProfile, updateSettings };
