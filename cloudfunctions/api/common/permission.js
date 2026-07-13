/**
 * 事件树 - 权限检查
 * V1 单人版：用户只能访问自己 ownerId 的数据
 * V2 团队版在此基础上扩展
 */

/**
 * V1: 检查用户是否有权读取/编辑项目
 */
function checkProjectOwner(openid, project) {
  if (!project) return false;
  if (project.ownerId !== openid) return false;
  return true;
}

function canReadProject(openid, project) {
  return checkProjectOwner(openid, project);
}

function canEditProject(openid, project) {
  return checkProjectOwner(openid, project);
}

function canManageProject(openid, project) {
  return checkProjectOwner(openid, project);
}

function canReadTask(openid, task, project) {
  return canReadProject(openid, project);
}

function canEditTask(openid, task, project) {
  return canEditProject(openid, project);
}

function canCompleteTask(openid, task, project) {
  return canEditProject(openid, project);
}

function canViewActivity(openid, activity) {
  const { visibleTo } = activity;
  if (!visibleTo || !Array.isArray(visibleTo)) return false;
  return visibleTo.includes(openid);
}

module.exports = {
  canReadProject, canEditProject, canManageProject,
  canReadTask, canEditTask, canCompleteTask, canViewActivity
};
