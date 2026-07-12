const scheduleService = require('../../services/schedule-service');
const taskService = require('../../services/task-service');
const { priorityLabel, statusLabel } = require('../../utils/format');

Page({
  data: { tab: 'pending', tasks: [], todayTasks: [], upcomingTasks: [], overdueTasks: [], loading: true, error: '', operatingId: '' },
  onShow() { if (this.getTabBar()) this.getTabBar().setData({ selected: 2 }); this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    const res = await scheduleService.listScheduledTasks();
    if (!res.success) { console.error('[activity] pending load failed:', res); return this.setData({ loading: false, error: res.message || '动态加载失败' }); }
    this.setData({ tasks: (res.data.tasks || []).map(decorateTask), loading: false, error: '' });
    this.buildPending();
  },
  retry() { this.load(); },
  choose(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },
  buildPending() {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const soonEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
    const active = this.data.tasks.filter(task => !task.isCompleted && task.status !== 'closed_by_parent');
    const target = task => new Date(task.dueAt || task.endAt);
    this.setData({
      overdueTasks: active.filter(task => target(task) < today).map(withOverdueText),
      todayTasks: active.filter(task => target(task) >= today && target(task) < tomorrow),
      upcomingTasks: active.filter(task => target(task) >= tomorrow && target(task) < soonEnd)
    });
  },
  openTask(e) { const item = e.detail.item; wx.navigateTo({ url: `/pages/task-edit/task-edit?projectId=${item.projectId}&id=${item._id}` }); },
  async toggleTask(e) {
    const item = e.detail.item;
    if (this.data.operatingId) return;
    this.setData({ operatingId: item._id });
    const res = await taskService.complete(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ tasks: this.data.tasks.map(task => task._id === item._id ? decorateTask({ ...task, status: 'completed', completedAt: new Date().toISOString() }) : task) });
    this.buildPending();
  }
});

function decorateTask(task) { const isCompleted = task.status === 'completed' || task.status === 'approved'; const target = task.dueAt || task.endAt; return { ...task, isCompleted, priorityText: priorityLabel(task.priority), statusText: statusLabel(task.status), timeText: taskTimeText(task), overdue: !isCompleted && target && new Date(target).getTime() < Date.now() }; }
function withOverdueText(task) { const days = Math.max(1, Math.ceil((startOfDay(new Date()).getTime() - startOfDay(new Date(task.dueAt || task.endAt)).getTime()) / 86400000)); return { ...task, timeText: `已逾期${days}天 · ${task.timeText}`, overdue: true }; }
function taskTimeText(task) { const value = task.dueAt || task.endAt; const date = new Date(value); if (Number.isNaN(date.getTime())) return '时间待确认'; const pad = number => String(number).padStart(2, '0'); return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
