/**
 * 事件树 - 云函数端枚举（与服务端一致）
 */

const TIME_MODE = { NONE: 'none', RANGE: 'range', ONGOING: 'ongoing' };
const SCHEDULE_TYPE = { NONE: 'none', DEADLINE: 'deadline', RANGE: 'range' };
const PROJECT_STATUS = { ACTIVE: 'active', COMPLETED: 'completed', ARCHIVED: 'archived', CANCELLED: 'cancelled' };
const TASK_STATUS = { TODO: 'todo', DOING: 'doing', COMPLETED: 'completed', CLOSED_BY_PARENT: 'closed_by_parent', CANCELLED: 'cancelled', SUBMITTED: 'submitted', APPROVED: 'approved', REJECTED: 'rejected' };
const PRIORITY = { CORE: 'core', IMPORTANT: 'important', OPTIONAL: 'optional' };
const SOURCE_TYPE = { PERSONAL: 'personal', ASSIGNED: 'assigned' };
const VISIBILITY = { PRIVATE: 'private', TEAM: 'team', SPECIFIED: 'specified' };
const REMINDER_STATUS = { PENDING: 'pending', PROCESSING: 'processing', SENT: 'sent', CANCELLED: 'cancelled', FAILED: 'failed' };
const LIMITS = {
  PROJECT_TITLE_MIN: 1, PROJECT_TITLE_MAX: 40, PROJECT_DESC_MAX: 1000,
  TASK_TITLE_MAX: 60, TASK_NOTE_MAX: 500, GROUP_NAME_MIN: 1, GROUP_NAME_MAX: 20
};
const SORT_STEP = 1000;

module.exports = {
  TIME_MODE, SCHEDULE_TYPE, PROJECT_STATUS, TASK_STATUS,
  PRIORITY, SOURCE_TYPE, VISIBILITY, REMINDER_STATUS, LIMITS, SORT_STEP
};
