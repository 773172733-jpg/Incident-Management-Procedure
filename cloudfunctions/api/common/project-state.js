'use strict';

function allBranchesCompleted(taskCount, completedTaskCount) {
  const total = Math.max(0, Number(taskCount) || 0);
  const completed = Math.max(0, Number(completedTaskCount) || 0);
  return total > 0 && completed === total;
}

function isProjectInTrash(project) {
  return Boolean(project && project.deletedAt);
}

function withProjectCompletionState(project) {
  if (!project) return project;
  return {
    ...project,
    allBranchesCompleted: allBranchesCompleted(
      project.taskCountCache,
      project.completedTaskCountCache
    )
  };
}

module.exports = {
  allBranchesCompleted,
  isProjectInTrash,
  withProjectCompletionState
};
