/**
 * 事件树 - 统一错误码
 */

const ERROR_CODES = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: '未登录或身份过期' },
  FORBIDDEN: { code: 'FORBIDDEN', message: '无权访问' },
  INVALID_PARAMS: { code: 'INVALID_PARAMS', message: '参数无效' },
  PROJECT_NOT_FOUND: { code: 'PROJECT_NOT_FOUND', message: '事件不存在或无权访问' },
  TASK_NOT_FOUND: { code: 'TASK_NOT_FOUND', message: '任务不存在或无权访问' },
  GROUP_NOT_FOUND: { code: 'GROUP_NOT_FOUND', message: '分组不存在' },
  PROJECT_ALREADY_COMPLETED: { code: 'PROJECT_ALREADY_COMPLETED', message: '事件已结束' },
  TASK_ALREADY_COMPLETED: { code: 'TASK_ALREADY_COMPLETED', message: '任务已完成' },
  INVALID_TIME_RANGE: { code: 'INVALID_TIME_RANGE', message: '时间范围无效' },
  REMINDER_PERMISSION_REQUIRED: { code: 'REMINDER_PERMISSION_REQUIRED', message: '需要提醒权限' },
  VERSION_CONFLICT: { code: 'VERSION_CONFLICT', message: '数据已被修改，请刷新后重试' },
  INVALID_REORDER: { code: 'INVALID_REORDER', message: '排序数据无效，请刷新后重试' },
  TASK_PARENT_PROJECT_DELETED: { code: 'TASK_PARENT_PROJECT_DELETED', message: '请先恢复所属大事件' },
  RATE_LIMITED: { code: 'RATE_LIMITED', message: '操作太频繁，请稍后重试' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: '服务器错误，请稍后重试' },
  NETWORK_ERROR: { code: 'NETWORK_ERROR', message: '网络异常，请检查网络后重试' }
};

function getError(code) {
  return ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
}

/** 将 wx.cloud.callFunction 的异常转为统一格式 */
function handleCloudError(err) {
  if (err && err.errCode === -1) {
    return ERROR_CODES.NETWORK_ERROR;
  }
  return ERROR_CODES.INTERNAL_ERROR;
}

module.exports = { ERROR_CODES, getError, handleCloudError };
