const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');
const { formatDateTime } = require('../../utils/date');
const { statusLabel, priorityLabel } = require('../../utils/format');
const { projectIconView } = require('../../constants/project-icons');

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
      ...item, ...projectIconView(item, (item.title || '事').slice(0, 1)), timeText: `删除于 ${formatDateTime(item.deletedAt)}`,
      stateText: statusLabel(item.status), extraText: `原进度 ${Math.max(0, Math.min(100, Number(item.progressCache) || 0))}%`
    }));
    const tasks = (taskRes.data.tasks || []).map(item => ({
      ...item, deletedText: formatDateTime(item.deletedAt), priorityText: priorityLabel(item.priority), projectTitle: item.projectTitle || '原备忘录不存在'
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
    wx.showToast({ title: '备忘录已恢复', icon: 'success' });
  },
  async restoreTask(e) {
    const item = e.currentTarget.dataset.item;
    if (item.parentProjectDeleted) return wx.showToast({ title: '请先恢复所属备忘录', icon: 'none' });
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
    const confirmed = await confirmDanger(
      '永久删除',
      '永久删除后，该备忘录及其分支任务将无法恢复，确定继续吗？',
      '永久删除'
    );
    if (!confirmed) return;
    this.setData({ operatingId: item._id });
    const res = await projectService.purge(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: '永久删除失败，请稍后重试', icon: 'none', duration: 3000 });
    this.setData({
      projects: this.data.projects.filter(project => project._id !== item._id),
      tasks: this.data.tasks.filter(task => task.projectId !== item._id)
    }, () => this.applyTab());
    wx.showToast({ title: '已永久删除', icon: 'success' });
  },
  async clearTrash() {
    if (this.data.operatingId || this.data.clearing || (!this.data.projects.length && !this.data.tasks.length)) return;
    const confirmed = await confirmDanger(
      '清空回收站',
      '清空后所有内容将无法恢复，确定清空回收站吗？',
      '清空'
    );
    if (!confirmed) return;
    this.setData({ clearing: true });
    const res = await projectService.clearTrash();
    this.setData({ clearing: false });
    if (!res.success) return wx.showToast({ title: '清空失败，请稍后重试', icon: 'none', duration: 3000 });
    this.setData({ projects: [], tasks: [] }, () => this.applyTab());
    wx.showToast({ title: '回收站已清空', icon: 'success' });
  }
});

function confirmDanger(title, content, confirmText) {
  return new Promise(resolve => wx.showModal({
    title,
    content,
    confirmText,
    confirmColor: '#F04A4A',
    success: result => resolve(!!result.confirm),
    fail: () => resolve(false)
  }));
}
