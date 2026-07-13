/**
 * 事件树 - 身份认证
 * 从云函数 context 中获取用户身份
 */

const cloud = require('wx-server-sdk');

let _initialized = false;
function ensureInit() {
  if (!_initialized) {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    _initialized = true;
  }
}

function getUserId(context) {
  ensureInit();
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;
  if (!OPENID) {
    console.error('[auth] OPENID not available from getWXContext');
  }
  return OPENID || '';
}

function getAppId(context) {
  ensureInit();
  const { APPID } = cloud.getWXContext();
  return APPID || '';
}

module.exports = { getUserId, getAppId };
