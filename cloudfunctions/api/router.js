/**
 * 事件树 - API 路由器
 */
const userModule = require('./modules/user/index');
const projectModule = require('./modules/project/index');
const taskModule = require('./modules/task/index');
const groupModule = require('./modules/group/index');
const activityModule = require('./modules/activity/index');
const calendarModule = require('./modules/calendar/index');
const reminderModule = require('./modules/reminder/index');

const moduleMap = {
  user: userModule,
  project: projectModule,
  task: taskModule,
  group: groupModule,
  activity: activityModule,
  calendar: calendarModule,
  reminder: reminderModule
};

async function dispatch(moduleName, action, payload, context) {

  const mod = moduleMap[moduleName];
  if (!mod) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '模块 ' + moduleName + ' 不存在',
      data: null
    };
  }

  const handler = mod[action];
  if (!handler) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '操作 ' + moduleName + '.' + action + ' 不存在',
      data: null
    };
  }

  const result = await handler(payload, context);
  return result;
}

module.exports = { dispatch };
