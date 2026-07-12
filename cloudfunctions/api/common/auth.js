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
    console.log('[auth] cloud.init done');
  }
}

function getUserId(context) {
  ensureInit();
  const wxContext = cloud.getWXContext();
  console.log('[auth] getWXContext', JSON.stringify({
    hasOpenid: Boolean(wxContext && wxContext.OPENID),
    hasAppId: Boolean(wxContext && wxContext.APPID),
    hasUnionId: Boolean(wxContext && wxContext.UNIONID),
    env: wxContext && wxContext.ENV
  }));
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
