/**
 * 事件树 - 身份认证
 * 从云函数 context 中获取用户身份
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function getUserId(context) {
  const { OPENID } = cloud.getWXContext();
  return OPENID || '';
}

function getAppId(context) {
  const { APPID } = cloud.getWXContext();
  return APPID || '';
}

module.exports = { getUserId, getAppId };
