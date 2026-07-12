/**
 * 事件树 - API 路由器
 */
const userModule = require('./modules/user/index');

const moduleMap = {
  user: userModule
};

async function dispatch(moduleName, action, payload, context) {
  const mod = moduleMap[moduleName];
  if (!mod) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `模块 ${moduleName} 不存在`,
      data: null
    };
  }

  const handler = mod[action];
  if (!handler) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: `操作 ${moduleName}.${action} 不存在`,
      data: null
    };
  }

  return handler(payload, context);
}

module.exports = { dispatch };
