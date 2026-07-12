/**
 * 事件树 - API 云函数入口
 */
const router = require('./router');

// 云函数入口
exports.main = async (event = {}, context = {}) => {
  const moduleName = event.module;
  const action = event.action;
  const payload = event.payload || {};

  console.log('[api] request', JSON.stringify({
    requestId: context.requestId || '',
    module: moduleName,
    action: action,
    payloadKeys: payload ? Object.keys(payload) : []
  }));

  if (!moduleName || !action) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '缺少 module 或 action 参数',
      data: null
    };
  }

  try {
    const result = await router.dispatch(moduleName, action, payload, context);
    if (!result || typeof result.success !== 'boolean') {
      console.error('[api] invalid handler response', JSON.stringify({
        module: moduleName,
        action: action,
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : 'null'
      }));
      return {
        success: false,
        code: 'INTERNAL_ERROR',
        message: '服务器返回格式异常',
        data: null
      };
    }
    return {
      success: result.success,
      code: result.code || (result.success ? 'OK' : 'INTERNAL_ERROR'),
      message: result.message || '',
      data: result.data === undefined ? null : result.data
    };
  } catch (err) {
    console.error('[api] unhandled error', JSON.stringify({
      requestId: context.requestId || '',
      module: moduleName,
      action: action,
      message: err && err.message,
      stack: err && err.stack,
      code: err && err.code,
      errCode: err && err.errCode,
      errMsg: err && err.errMsg
    }));
    return {
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器错误，请稍后重试',
      data: null
    };
  }
};
