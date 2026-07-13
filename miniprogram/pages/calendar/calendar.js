const calendarService = require('../../services/calendar-service');
const taskService = require('../../services/task-service');
const { priorityLabel, statusLabel } = require('../../utils/format');

Page({
  data: { viewYear: 0, viewMonth: 0, monthTitle: '', days: [], tasks: [], selectedKey: '', selectedLabel: '', selectedTasks: [], summary: { total: 0, pending: 0, completed: 0, overdue: 0 }, monthTaskCount: 0, loading: true, monthChanging: false, error: '', operatingId: '' },
  onLoad() { const now = new Date(); this.setData({ viewYear: now.getFullYear(), viewMonth: now.getMonth(), selectedKey: dateKey(now) }); },
  onShow() { if (this.getTabBar()) this.getTabBar().setData({ selected: 1 }); this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    var res = await calendarService.month({ year: this.data.viewYear, month: this.data.viewMonth + 1 });
    if (!res.success) { console.error('[calendar] load:', res); return this.setData({ loading: false, error: res.message || '日历加载失败' }); }
    this.setData({ tasks: (res.data.tasks || []).map(decorateTask), monthDays: (res.data.days || {}), loading: false, error: '' });
    this.renderCalendar();
  },
  retry() { this.load(); },
  previousMonth() { this.changeMonth(-1); },
  nextMonth() { this.changeMonth(1); },
  changeMonth(offset) {
    var d = new Date(this.data.viewYear, this.data.viewMonth + offset, 1);
    this.setData({ viewYear: d.getFullYear(), viewMonth: d.getMonth(), selectedKey: dateKey(d) });
    this.load();
  },
  today() { const now = new Date(); this.setData({ viewYear: now.getFullYear(), viewMonth: now.getMonth(), selectedKey: dateKey(now) }); this.load(); },
  selectDay(e) {
    const key = e.currentTarget.dataset.key;
    const date = parseKey(key);
    const monthChanged = date.getFullYear() !== this.data.viewYear || date.getMonth() !== this.data.viewMonth;
    this.setData({ selectedKey: key, viewYear: date.getFullYear(), viewMonth: date.getMonth(), monthChanging: monthChanged });
    this.renderCalendar();
    if (monthChanged) setTimeout(() => this.setData({ monthChanging: false }), 160);
  },
  renderCalendar() {
    const year = this.data.viewYear;
    const month = this.data.viewMonth;
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - offset);
    const todayKey = dateKey(new Date());
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const key = dateKey(date);
      const tasks = this.data.tasks.filter(task => occursOn(task, key));
      const allCompleted = tasks.length && tasks.every(task => task.isCompleted);
      const hasOverdue = tasks.some(task => task.overdue);
      return {
        key, day: date.getDate(), inMonth: date.getMonth() === month,
        isToday: key === todayKey, selected: key === this.data.selectedKey,
        count: tasks.length, marker: hasOverdue ? 'overdue' : allCompleted ? 'completed' : tasks.length ? 'pending' : ''
      };
    });
    const selectedTasks = this.data.tasks.filter(task => occursOn(task, this.data.selectedKey));
    const summary = {
      total: selectedTasks.length,
      pending: selectedTasks.filter(task => !task.isCompleted && task.status !== 'closed_by_parent').length,
      completed: selectedTasks.filter(task => task.isCompleted).length,
      overdue: selectedTasks.filter(task => task.overdue).length
    };
    const monthStart = dateKey(new Date(year, month, 1));
    const monthEnd = dateKey(new Date(year, month + 1, 0));
    const monthTaskCount = this.data.tasks.filter(task => overlaps(task, monthStart, monthEnd)).length;
    this.setData({ days, selectedTasks, summary, monthTaskCount, monthTitle: `${year}年${month + 1}月`, selectedLabel: selectedDateLabel(this.data.selectedKey) });
  },
  onPullDownRefresh() { this.load().finally(function(){wx.stopPullDownRefresh();}); },
  openTask(e) { const item = e.detail.item; wx.navigateTo({ url: `/pages/task-edit/task-edit?projectId=${item.projectId}&id=${item._id}` }); },
  async toggleTask(e) {
    const item = e.detail.item;
    if (this.data.operatingId || item.status === 'closed_by_parent') return;
    this.setData({ operatingId: item._id });
    const res = item.isCompleted ? await taskService.reopen(item._id) : await taskService.complete(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ tasks: this.data.tasks.map(task => task._id === item._id ? decorateTask({ ...task, status: item.isCompleted ? 'todo' : 'completed', completedAt: item.isCompleted ? null : new Date().toISOString() }) : task) });
    this.renderCalendar();
  }
});

function decorateTask(task) { const isCompleted = task.status === 'completed' || task.status === 'approved'; const target = task.dueAt || task.endAt; return { ...task, isCompleted, priorityText: priorityLabel(task.priority), statusText: statusLabel(task.status), timeText: taskTimeText(task), overdue: !isCompleted && task.status !== 'closed_by_parent' && target && new Date(target).getTime() < Date.now() }; }
function occursOn(task, key) { if (task.scheduleType === 'deadline') return dateKey(new Date(task.dueAt)) === key; if (task.scheduleType === 'range') return key >= dateKey(new Date(task.startAt)) && key <= dateKey(new Date(task.endAt)); return false; }
function overlaps(task, start, end) { if (task.scheduleType === 'deadline') { const key = dateKey(new Date(task.dueAt)); return key >= start && key <= end; } if (task.scheduleType === 'range') return dateKey(new Date(task.startAt)) <= end && dateKey(new Date(task.endAt)) >= start; return false; }
function taskTimeText(task) { if (task.scheduleType === 'deadline') return `截止 ${shortTime(task.dueAt)}`; return `${shortTime(task.startAt)}—${shortTime(task.endAt)}`; }
function shortTime(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return '时间待确认'; const pad = number => String(number).padStart(2, '0'); return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function dateKey(date) { if (Number.isNaN(date.getTime())) return ''; const pad = number => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseKey(key) { const parts = key.split('-').map(Number); return new Date(parts[0], parts[1] - 1, parts[2]); }
function selectedDateLabel(key) { const date = parseKey(key); return `${date.getMonth() + 1}月${date.getDate()}日 星期${['日','一','二','三','四','五','六'][date.getDay()]}`; }
