const projectService = require('./project-service');
const taskService = require('./task-service');

async function listScheduledTasks() {
  const projectRes = await projectService.list({});
  if (!projectRes.success) return projectRes;
  const projects = (projectRes.data.projects || []).filter(project => project.status !== 'archived' && project.status !== 'cancelled');
  const taskResults = await Promise.all(projects.map(project => taskService.listByProject(project._id)));
  const failed = taskResults.find(result => !result.success);
  if (failed) return failed;
  const tasks = [];
  taskResults.forEach((result, index) => {
    const project = projects[index];
    (result.data.tasks || []).forEach(task => {
      if (task.scheduleType !== 'none') tasks.push({ ...task, projectTitle: project.title, projectStatus: project.status });
    });
  });
  return { success: true, code: 'OK', message: '', data: { tasks } };
}

module.exports = { listScheduledTasks };
