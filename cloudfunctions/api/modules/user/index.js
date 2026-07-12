/**
 * 事件树 - 用户模块
 * 包含 bootstrap（初始化/登录）、资料查询和设置更新
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const $ = db.command.aggregate;
const _ = db.command;

const auth = require('../../common/auth');
const { success, fail } = require('../../common/response');
const { writeActivityLog } = require('../../common/logger');

/**
 * bootstrap - 初始化用户
 * 每次小程序启动时调用
 * 1. 获取当前用户 OPENID
 * 2. 查询 users 集合是否存在
 * 3. 不存在则创建
 * 4. 返回用户信息 + 首页统计
 */
async function bootstrap(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) {
    return fail('UNAUTHORIZED', '无法获取用户身份');
  }

  // 查询用户
  let user = await db.collection('users').where({ openid }).get();
  let isNew = false;

  if (user.data.length === 0) {
    // 新用户，自动创建
    const now = db.serverDate();
    const newUser = {
      openid,
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

    const res = await db.collection('users').add({ data: newUser });
    newUser._id = res._id;
    user = { data: [newUser] };
    isNew = true;
    console.log('[user.bootstrap] new user created:', openid);
  } else {
    // 已有用户，更新最后活跃
    await db.collection('users').doc(user.data[0]._id).update({
      data: { updatedAt: db.serverDate() }
    });
  }

  const userData = user.data[0];

  // 获取首页统计
  const stats = await getDashboardStats(openid);

  return success({
    user: sanitizeUser(userData),
    isNew,
    stats
  }, isNew ? '欢迎加入事件树' : '');
}

/**
 * getProfile - 获取用户资料
 */
async function getProfile(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');

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
  const updateData = { updatedAt: db.serverDate() };

  if (nickname !== undefined) updateData.nickname = nickname.trim().substring(0, 32);
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

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
  const updateData = { updatedAt: db.serverDate() };

  if (defaultReminderMinutes !== undefined) {
    const valid = [0, 10, 30, 60, 1440];
    if (valid.includes(defaultReminderMinutes)) {
      updateData.defaultReminderMinutes = defaultReminderMinutes;
    }
  }
  if (completedTaskSink !== undefined) {
    updateData.completedTaskSink = !!completedTaskSink;
  }

  await db.collection('users').where({ openid }).update({ data: updateData });
  return success(null, '设置已更新');
}

/**
 * 首页统计
 */
async function getDashboardStats(openid) {
  const baseFilter = { ownerId: openid, deletedAt: _.eq(null) };

  const activeCount = await db.collection('projects').where({
    ...baseFilter,
    status: 'active'
  }).count();

  const completedCount = await db.collection('projects').where({
    ...baseFilter,
    status: 'completed'
  }).count();

  return {
    activeCount: activeCount.total,
    completedCount: completedCount.total
  };
}

/** 脱敏用户信息（移除敏感字段） */
function sanitizeUser(user) {
  if (!user) return null;
  const { openid, ...safe } = user;
  return safe;
}

module.exports = { bootstrap, getProfile, updateProfile, updateSettings };
