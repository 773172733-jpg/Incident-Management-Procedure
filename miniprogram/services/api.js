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
        const result = res.result;
        if (!result || typeof result.success !== 'boolean') {
          console.error('[api] ' + module + '.' + action + ' invalid response:', res);
          resolve({
            success: false,
            code: 'INVALID_CLOUD_RESPONSE',
            message: '云函数返回格式异常，请查看开发者工具控制台',
            data: null
          });
          return;
        }
        resolve(result);
      },
      fail: (err) => {
        console.error('[api] ' + module + '.' + action + ' failed:', err);
        const detail = String((err && (err.errMsg || err.message)) || '');
        const functionMissing = /FunctionName|function not found|-501000/i.test(detail);
        resolve({
          success: false,
          code: functionMissing ? 'CLOUD_FUNCTION_NOT_FOUND' : 'CLOUD_CALL_FAILED',
          message: functionMissing
            ? '云函数 api 尚未部署成功，请检查当前云环境'
            : '云函数调用失败，请查看开发者工具控制台',
          data: null
        });
      }
    });
  });
}

module.exports = { callApi };
