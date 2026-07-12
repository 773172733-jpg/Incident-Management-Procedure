/**
 * 事件树 - group 模块
 * 将在后续阶段实现
 */

const { success } = require('../../common/response');
const auth = require('../../common/auth');

async function placeholder(payload, context) {
  return success(null, '模块尚未实现');
}

module.exports = { placeholder };
