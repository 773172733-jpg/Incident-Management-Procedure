/**
 * 事件树 - 用户服务
 */
const { callApi } = require('./api');

/** 初始化用户（每次小程序启动时调用） */
function bootstrap() {
  return callApi('user', 'bootstrap');
}

/** 获取用户信息 */
function getProfile() {
  return callApi('user', 'getProfile');
}

/** 更新用户资料 */
function updateProfile(data) {
  return callApi('user', 'updateProfile', data);
}

/** 更新用户设置 */
function updateSettings(settings) {
  return callApi('user', 'updateSettings', settings);
}

module.exports = { bootstrap, getProfile, updateProfile, updateSettings };
