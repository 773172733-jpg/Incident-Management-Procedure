'use strict';

function allBranchesCompleted(taskCount, completedTaskCount) {
  const total = Math.max(0, Number(taskCount) || 0);
  const completed = Math.max(0, Number(completedTaskCount) || 0);
  return total > 0 && completed === total;
}

function isValidBranchTask(task) {
  return Boolean(task && !task.deletedAt && task.status !== 'cancelled');
}

function isCompletedBranchTask(task) {
  return Boolean(task && task.status === 'completed');
}

function summarizeProjectTasks(tasks) {
  const validTasks = (Array.isArray(tasks) ? tasks : []).filter(isValidBranchTask);
  const taskCount = validTasks.length;
  const completedTaskCount = validTasks.filter(isCompletedBranchTask).length;
  const progress = taskCount ? Math.round(completedTaskCount * 100 / taskCount) : 0;
  return {
    taskCount,
    completedTaskCount,
    progress,
    allBranchesCompleted: allBranchesCompleted(taskCount, completedTaskCount)
  };
}

function isProjectInTrash(project) {
  return Boolean(project && project.deletedAt);
}

function isEndedArchivedProject(project) {
  return Boolean(project && project.status === 'archived' && project.completedAt);
}

function isReopenableEndedProject(project) {
  return Boolean(project && (
    project.status === 'completed'
    || isEndedArchivedProject(project)
  ));
}

function buildCompletionArchiveState(now, ownerId, completedEarly) {
  return {
    status: 'archived',
    completedAt: now,
    completedBy: ownerId,
    completedEarly: completedEarly === true,
    archivedAt: now,
    updatedAt: now
  };
}

function buildReopenedProjectState(now) {
  return {
    status: 'active',
    completedAt: null,
    completedBy: null,
    completedEarly: false,
    archivedAt: null,
    updatedAt: now
  };
}

function statusBeforeParentClose(task) {
  return task && task.statusBeforeParentClose
    ? task.statusBeforeParentClose
    : 'todo';
}

function withProjectCompletionState(project, summary) {
  if (!project) return project;
  const stats = summary || {
    taskCount: project.taskCountCache,
    completedTaskCount: project.completedTaskCountCache,
    progress: project.progressCache
  };
  const taskCount = Math.max(0, Number(stats.taskCount) || 0);
  const completedTaskCount = Math.max(0, Number(stats.completedTaskCount) || 0);
  return {
    ...project,
    taskCount,
    completedTaskCount,
    taskCountCache: taskCount,
    completedTaskCountCache: completedTaskCount,
    progressCache: Math.max(0, Math.min(100, Number(stats.progress) || 0)),
    allBranchesCompleted: allBranchesCompleted(taskCount, completedTaskCount)
  };
}

module.exports = {
  allBranchesCompleted,
  isValidBranchTask,
  isCompletedBranchTask,
  summarizeProjectTasks,
  isProjectInTrash,
  isEndedArchivedProject,
  isReopenableEndedProject,
  buildCompletionArchiveState,
  buildReopenedProjectState,
  statusBeforeParentClose,
  withProjectCompletionState
};
