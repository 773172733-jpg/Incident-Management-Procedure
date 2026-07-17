const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');
const { formatDateTime } = require('../../utils/date');
const { statusLabel, priorityLabel } = require('../../utils/format');

Page({
  data: { projects: [], tasks: [], visibleProjects: [], visibleTasks: [], tab: 'all', loading: true, error: '', operatingId: '', clearing: false },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    const [projectRes, taskRes] = await Promise.all([projectService.listDeleted(), taskService.listDeleted()]);
    if (!projectRes.success || !taskRes.success) {
      console.error('[recycle-bin] load failed:', { projectRes, taskRes });
      return this.setData({ loading: false, error: projectRes.message || taskRes.message || '回收站加载失败' });
    }
    const projects = (projectRes.data.projects || []).map(item => ({
      ...item, iconText: item.iconValue || (item.title || '事').slice(0, 1), timeText: `删除于 ${formatDateTime(item.deletedAt)}`,
      stateText: statusLabel(item.status), extraText: `原进度 ${Math.max(0, Math.min(100, Number(item.progressCache) || 0))}%`
    }));
    const tasks = (taskRes.data.tasks || []).map(item => ({
      ...item, deletedText: formatDateTime(item.deletedAt), priorityText: priorityLabel(item.priority), projectTitle: item.projectTitle || '原大事件不存在'
    }));
    this.setData({ projects, tasks, loading: false, error: '' });
    this.applyTab();
  },
  retry() { this.load(); },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
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
    if (item.parentProjectDeleted) return wx.showToast({ title: '请先恢复所属大事件', icon: 'none' });
    if (this.data.operatingId) return;
    this.setData({ operatingId: item._id });
    const res = await taskService.restore(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ tasks: this.data.tasks.filter(task => task._id !== item._id) }, () => this.applyTab());
    wx.showToast({ title: res.message, icon: 'success' });
  },
  async purgeProject(e) {
    const item = e.detail.item;
    if (this.data.operatingId || this.data.clearing) return;
    const confirmed = await confirmPermanentDelete(
      '永久删除大事件',
      `将永久删除「${item.title}」及其全部分支任务、分组、提醒和动态记录。删除后无法恢复，确定继续吗？`
    );
    if (!confirmed) return;
    this.setData({ operatingId: item._id });
    const res = await projectService.purge(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none', duration: 3000 });
    this.setData({
      projects: this.data.projects.filter(project => project._id !== item._id),
      tasks: this.data.tasks.filter(task => task.projectId !== item._id)
    }, () => this.applyTab());
    wx.showToast({ title: res.message, icon: 'success' });
  },
  async clearTrash() {
    if (this.data.operatingId || this.data.clearing || (!this.data.projects.length && !this.data.tasks.length)) return;
    const confirmed = await confirmPermanentDelete(
      '清空回收站',
      `将永久删除回收站中的${this.data.projects.length}个大事件和${this.data.tasks.length}个分支任务，所有关联数据都无法恢复。确定清空吗？`
    );
    if (!confirmed) return;
    this.setData({ clearing: true });
    const res = await projectService.clearTrash();
    this.setData({ clearing: false });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none', duration: 3000 });
    this.setData({ projects: [], tasks: [] }, () => this.applyTab());
    wx.showToast({ title: res.message, icon: 'success' });
  }
});

function confirmPermanentDelete(title, content) {
  return new Promise(resolve => wx.showModal({
    title,
    content,
    confirmText: '永久删除',
    confirmColor: '#F04A4A',
    success: result => resolve(!!result.confirm),
    fail: () => resolve(false)
  }));
}
