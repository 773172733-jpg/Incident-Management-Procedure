const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');
const { formatDateTime } = require('../../utils/date');
Page({
  data: { projects: [], tasks: [], loading: true, error: '' },
  onShow() { this.load(); },
  async load() { this.setData({ loading: true, error: '' }); const [projectRes, taskRes] = await Promise.all([projectService.list({ deleted: true }), taskService.listDeleted()]); if (!projectRes.success || !taskRes.success) return this.setData({ loading: false, error: projectRes.message || taskRes.message }); this.setData({ projects: projectRes.data.projects.map(item => ({ ...item, deletedText: formatDateTime(item.deletedAt) })), tasks: taskRes.data.tasks.map(item => ({ ...item, deletedText: formatDateTime(item.deletedAt) })), loading: false }); },
  async restoreProject(e) { const res = await projectService.restore(e.currentTarget.dataset.id); wx.showToast({ title: res.message, icon: res.success ? 'success' : 'none' }); if (res.success) this.load(); },
  async restoreTask(e) { const res = await taskService.restore(e.currentTarget.dataset.id); wx.showToast({ title: res.message, icon: res.success ? 'success' : 'none' }); if (res.success) this.load(); },
  retry() { this.load(); }
});
