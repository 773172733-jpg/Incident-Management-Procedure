/**
 * 事件树 - 统一 API 调用层
 * 所有云函数调用都经过此模块，不直接在页面中调用 wx.cloud.callFunction
 */

const { CLOUD_FUNCTIONS } = require('../constants/config');

/**
 * 调用 api 云函数
 * @param {string} module - 模块名
 * @param {string} action - 动作
 * @param {object} payload - 参数
 */
function callApi(module, action, payload = {}) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTIONS.API,
      data: { module, action, payload },
      success: (res) => {
        const result = res.result || {};
        resolve(result);
      },
      fail: (err) => {
        console.error('[api] ' + module + '.' + action + ' failed:', err);
        resolve({
          success: false,
          code: 'NETWORK_ERROR',
          message: '网络异常，请检查网络后重试',
          data: null
        });
      }
    });
  });
}

module.exports = { callApi };