/**
 * 事件树 - API 路由器
 */
const userModule = require('./modules/user/index');
const projectModule = require('./modules/project/index');
const taskModule = require('./modules/task/index');
const groupModule = require('./modules/group/index');
const activityModule = require('./modules/activity/index');

const moduleMap = {
  user: userModule,
  project: projectModule,
  task: taskModule,
  group: groupModule,
  activity: activityModule
};

async function dispatch(moduleName, action, payload, context) {
  console.log('[router] dispatch', JSON.stringify({ module: moduleName, action: action }));

  const mod = moduleMap[moduleName];
  if (!mod) {
    console.warn('[router] module not found:', moduleName);
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '模块 ' + moduleName + ' 不存在',
      data: null
    };
  }

  const handler = mod[action];
  if (!handler) {
    console.warn('[router] action not found:', moduleName + '.' + action);
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '操作 ' + moduleName + '.' + action + ' 不存在',
      data: null
    };
  }

  console.log('[router] invoking handler:', moduleName + '.' + action);
  const result = await handler(payload, context);
  console.log('[router] handler result', JSON.stringify({
    module: moduleName,
    action: action,
    success: result && result.success,
    code: result && result.code,
    hasData: !!(result && result.data)
  }));
  return result;
}

module.exports = { dispatch };
