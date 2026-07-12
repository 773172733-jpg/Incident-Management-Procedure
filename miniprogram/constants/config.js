/**
 * 事件树 - 应用配置
 */

// 云开发环境 ID。留空时使用微信开发者工具中当前选择的默认环境，
// 如需固定环境，请填写完整环境 ID，禁止使用 prod 等占位名称。
const DB_ENV = '';

// 云函数名称
const CLOUD_FUNCTIONS = {
  API: 'api',
  REMINDER_WORKER: 'reminder-worker'
};

// 缓存 Key
const STORAGE_KEYS = {
  USER_INFO: 'event_tree_user_info'
};

module.exports = {
  DB_ENV,
  CLOUD_FUNCTIONS,
  STORAGE_KEYS
};
