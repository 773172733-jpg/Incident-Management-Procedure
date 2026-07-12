/**
 * 事件树 - 集中枚举
 * 所有枚举值在 V1 和 V2 之间保持一致，V2 只增加不修改
 */

// 大事件时间模式
const TIME_MODE = {
  NONE: 'none',          // 不设置时间
  RANGE: 'range',        // 设置起止期间
  ONGOING: 'ongoing'     // 持续进行
};

// 分支任务时间类型
const SCHEDULE_TYPE = {
  NONE: 'none',          // 不设置时间
  DEADLINE: 'deadline',  // 截止时间
  RANGE: 'range'         // 起止期间
};

// 大事件状态
const PROJECT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled'
};

// 分支任务状态
const TASK_STATUS = {
  TODO: 'todo',
  DOING: 'doing',
  COMPLETED: 'completed',
  CLOSED_BY_PARENT: 'closed_by_parent',
  CANCELLED: 'cancelled',
  SUBMITTED: 'submitted',   // V2 预留
  APPROVED: 'approved',     // V2 预留
  REJECTED: 'rejected'      // V2 预留
};

// 优先级
const PRIORITY = {
  CORE: 'core',
  IMPORTANT: 'important',
  OPTIONAL: 'optional'
};

// 来源类型
const SOURCE_TYPE = {
  PERSONAL: 'personal',
  ASSIGNED: 'assigned'    // V2 预留
};

// 可见性
const VISIBILITY = {
  PRIVATE: 'private',
  TEAM: 'team',           // V2 预留
  SPECIFIED: 'specified'  // V2 预留
};

// 完成模式
const COMPLETION_MODE = {
  MANUAL: 'manual'
};

// 提醒渠道
const REMINDER_CHANNEL = {
  IN_APP: 'in_app',
  WECHAT_SUBSCRIPTION: 'wechat_subscription'
};

// 提醒状态
const REMINDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

// 用户状态
const USER_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled'
};

// 计划类型
const PLAN_TYPE = {
  FREE: 'free'
};

// 活动日志 actions
const ACTIVITY_ACTION = {
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_COMPLETED: 'project.completed',
  PROJECT_COMPLETED_EARLY: 'project.completed_early',
  PROJECT_REOPENED: 'project.reopened',
  PROJECT_ARCHIVED: 'project.archived',
  PROJECT_DELETED: 'project.deleted',
  PROJECT_RESTORED: 'project.restored',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_COMPLETED: 'task.completed',
  TASK_REOPENED: 'task.reopened',
  TASK_DELETED: 'task.deleted',
  TASK_RESTORED: 'task.restored',
  TASK_CLOSED_BY_PARENT: 'task.closed_by_parent',
  GROUP_CREATED: 'group.created',
  GROUP_UPDATED: 'group.updated',
  REMINDER_SENT: 'reminder.sent',
  REMINDER_FAILED: 'reminder.failed'
};

// 提醒提前量（分钟）
const REMINDER_OFFSETS = [0, 10, 30, 60, 1440];

// 排序步长
const SORT_STEP = 1000;

// 分页大小
const PAGE_SIZE = 30;

// 校验限制
const LIMITS = {
  PROJECT_TITLE_MIN: 1,
  PROJECT_TITLE_MAX: 40,
  PROJECT_DESC_MAX: 1000,
  TASK_TITLE_MAX: 60,
  TASK_NOTE_MAX: 500,
  GROUP_NAME_MAX: 20,
  GROUP_NAME_MIN: 1
};

module.exports = {
  TIME_MODE,
  SCHEDULE_TYPE,
  PROJECT_STATUS,
  TASK_STATUS,
  PRIORITY,
  SOURCE_TYPE,
  VISIBILITY,
  COMPLETION_MODE,
  REMINDER_CHANNEL,
  REMINDER_STATUS,
  USER_STATUS,
  PLAN_TYPE,
  ACTIVITY_ACTION,
  REMINDER_OFFSETS,
  SORT_STEP,
  PAGE_SIZE,
  LIMITS
};
