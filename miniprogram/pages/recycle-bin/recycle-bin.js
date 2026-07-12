const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');
const { formatDateTime } = require('../../utils/date');
const { statusLabel, priorityLabel } = require('../../utils/format');

Page({
  data: { projects: [], tasks: [], visibleProjects: [], visibleTasks: [], tab: 'all', loading: true, error: '', operatingId: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    const [projectRes, taskRes] = await Promise.all([projectService.list({ deletedMode: 'deleted' }), taskService.listDeleted()]);
    if (!projectRes.success || !taskRes.success) {
      console.error('[recycle-bin] load failed:', { projectRes, taskRes });
      return this.setData({ loading: false, error: projectRes.message || taskRes.message || '回收站加载失败' });
    }
    const projects = (projectRes.data.projects || []).map(item => ({
      ...item, iconText: item.iconValue || (item.title || '事').slice(0, 1), timeText: `删除于 ${formatDateTime(item.deletedAt)}`,
      stateText: statusLabel(item.status), extraText: `原进度 ${Math.max(0, Math.min(100, Number(item.progressCache) || 0))}%`
    }));
    const tasks = (taskRes.data.tasks || []).map(item => ({
      ...item, deletedText: formatDateTime(item.deletedAt), priorityText: priorityLabel(item.priority), projectTitle: item.projectTitle || '原事件不存在'
    }));
    this.setData({ projects, tasks, loading: false, error: '' });
    this.applyTab();
  },
  retry() { this.load(); },
  chooseTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }, () => this.applyTab()); },
  applyTab() {
    this.setData({
      visibleProjects: this.data.tab === 'task' ? [] : this.data.projects,
      visibleTasks: this.data.tab === 'project' ? [] : this.data.tasks
    });
  },
  async restoreProject(e) {
    const item = e.detail.item;
    if (this.data.operatingId) return;
    this.setData({ operatingId: item._id });
    const res = await projectService.restore(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ projects: this.data.projects.filter(project => project._id !== item._id) }, () => this.applyTab());
    wx.showToast({ title: res.message, icon: 'success' });
  },
  async restoreTask(e) {
    const item = e.currentTarget.dataset.item;
    if (item.parentProjectDeleted) return wx.showToast({ title: '请先恢复所属事件', icon: 'none' });
    if (this.data.operatingId) return;
    this.setData({ operatingId: item._id });
    const res = await taskService.restore(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ tasks: this.data.tasks.filter(task => task._id !== item._id) }, () => this.applyTab());
    wx.showToast({ title: res.message, icon: 'success' });
  }
});
