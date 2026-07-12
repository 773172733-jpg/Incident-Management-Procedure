/**
 * 事件树 - 统一响应格式
 */
function success(data = null, message = '') {
  return { success: true, code: 'OK', message, data };
}

function fail(code, message, data = null) {
  return { success: false, code, message, data };
}

module.exports = { success, fail };
