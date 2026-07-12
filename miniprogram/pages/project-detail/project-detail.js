const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');
const groupService = require('../../services/group-service');
const format = require('../../utils/format');
Page({
  data: { id: '', project: null, tasks: [], groups: [], groupId: 'all', priority: 'all', loading: true, error: '', operatingTaskId: '', sorting: false },
  onLoad(query) { this.setData({ id: query.id || '' }); },
  onShow() { if (this.data.id) this.load(); },
  async load() { this.setData({ loading: true, error: '' }); const [projectRes, taskRes, groupRes] = await Promise.all([projectService.get(this.data.id), taskService.listByProject(this.data.id), groupService.list(this.data.id)]); if (!projectRes.success) return this.setData({ loading: false, error: projectRes.message }); const tasks = taskRes.success ? taskRes.data.tasks.map(item => ({ ...item, groupKey: item.groupId || '', timeText: format.taskTimeText(item), priorityText: format.priorityLabel(item), completedText: item.completedAt ? formatDateTime(item.completedAt) + ' 完成' : '' })).sort((a, b) => (a.groupKey === b.groupKey ? ((a.status === 'completed') - (b.status === 'completed') || a.sortOrder - b.sortOrder) : 0)) : []; this.setData({ project: projectRes.data.project, tasks, groups: groupRes.success ? groupRes.data.groups : [], loading: false, error: taskRes.success && groupRes.success ? '' : (taskRes.message || groupRes.message) }); },
  add() { wx.navigateTo({ url: '/pages/task-edit/task-edit?projectId=' + this.data.id }); },
  edit() { wx.navigateTo({ url: '/pages/project-edit/project-edit?id=' + this.data.id }); },
  manageGroups() { wx.navigateTo({ url: '/pages/group-manage/group-manage?projectId=' + this.data.id }); },
  editTask(e) { wx.navigateTo({ url: '/pages/task-edit/task-edit?projectId=' + this.data.id + '&id=' + e.currentTarget.dataset.id }); },
  async deleteTask(e) { const task = e.currentTarget.dataset.item; const result = await new Promise(resolve => wx.showModal({ title: '删除任务', content: `确定将“${task.title}”移入回收站吗？`, confirmColor: '#F04A4A', success: resolve })); if (!result.confirm) return; const res = await taskService.softDelete(task._id); wx.showToast({ title: res.message, icon: res.success ? 'success' : 'none' }); if (res.success) this.load(); },
  async toggle(e) { const task = e.currentTarget.dataset.item; if (this.data.operatingTaskId) return; this.setData({ operatingTaskId: task._id }); const res = task.status === 'completed' ? await taskService.reopen(task._id) : await taskService.complete(task._id); this.setData({ operatingTaskId: '' }); if (!res.success) wx.showToast({ title: res.message, icon: 'none' }); this.load(); },
  async moveTask(e) { if (this.data.sorting || this.data.groupId === 'all') return; const taskId = e.currentTarget.dataset.id, direction = Number(e.currentTarget.dataset.direction); const inGroup = this.data.tasks.filter(item => item.groupKey === this.data.groupId).sort((a, b) => a.sortOrder - b.sortOrder); const index = inGroup.findIndex(item => item._id === taskId), target = index + direction; if (index < 0 || target < 0 || target >= inGroup.length) return; [inGroup[index], inGroup[target]] = [inGroup[target], inGroup[index]]; this.setData({ sorting: true }); const res = await taskService.reorder(this.data.id, inGroup.map(item => item._id)); this.setData({ sorting: false }); if (!res.success) wx.showToast({ title: res.message, icon: 'none' }); this.load(); },
  group(e) { this.setData({ groupId: e.currentTarget.dataset.id }); },
  priority(e) { this.setData({ priority: e.currentTarget.dataset.id }); },
  retry() { this.load(); }
});
function formatDateTime(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = number => String(number).padStart(2, '0'); return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`; }
