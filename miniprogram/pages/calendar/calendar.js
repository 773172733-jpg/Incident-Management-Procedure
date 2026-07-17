const calendarService = require('../../services/calendar-service');
const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');

Page({
  data: {
    viewYear: 0, viewMonth: 0, monthTitle: '', days: [], monthData: {}, entries: [],
    selectedKey: '', selectedLabel: '', selectedEntries: [], selectedProjects: [], selectedTasks: [],
    summary: { total: 0, projectCount: 0, taskCount: 0, activeCount: 0, completedCount: 0 },
    monthEntryCount: 0, loading: true, refreshing: false, monthChanging: false,
    hasLoaded: false, error: '', operatingId: ''
  },
  onLoad() { const now = new Date(); this.setData({ viewYear: now.getFullYear(), viewMonth: now.getMonth(), selectedKey: dateKey(now) }); },
  onShow() { if (this.getTabBar()) this.getTabBar().setData({ selected: 1 }); this.load(); },
  async load(options = {}) {
    const changing = options.monthChanging === true;
    this.setData({ loading: !this.data.hasLoaded, monthChanging: changing, error: '', ...(changing ? { days: [], entries: [], monthData: {}, monthEntryCount: 0, selectedEntries: [], selectedProjects: [], selectedTasks: [] } : {}) });
    const res = await calendarService.month({ year: this.data.viewYear, month: this.data.viewMonth + 1, timezone: 'Asia/Shanghai' });
    if (!res.success) {
      console.error('[calendar] load:', res);
      this.setData({ loading: false, refreshing: false, monthChanging: false, hasLoaded: true, error: res.message || '日历加载失败' });
      return;
    }
    this.setData({ entries: res.data.entries || [], monthData: res.data.days || {}, loading: false, refreshing: false, monthChanging: false, hasLoaded: true, error: '' });
    this.renderCalendar();
  },
  retry() { this.load(); },
  previousMonth() { this.changeMonth(-1); },
  nextMonth() { this.changeMonth(1); },
  changeMonth(offset) {
    const date = new Date(this.data.viewYear, this.data.viewMonth + offset, 1);
    this.setData({ viewYear: date.getFullYear(), viewMonth: date.getMonth(), selectedKey: dateKey(date), monthTitle: `${date.getFullYear()}年${date.getMonth() + 1}月` });
    this.load({ monthChanging: true });
  },
  today() {
    const now = new Date();
    const changed = now.getFullYear() !== this.data.viewYear || now.getMonth() !== this.data.viewMonth;
    this.setData({ viewYear: now.getFullYear(), viewMonth: now.getMonth(), selectedKey: dateKey(now) });
    changed ? this.load({ monthChanging: true }) : this.renderCalendar();
  },
  selectDay(e) {
    const key = e.currentTarget.dataset.key, date = parseKey(key);
    const changed = date.getFullYear() !== this.data.viewYear || date.getMonth() !== this.data.viewMonth;
    this.setData({ selectedKey: key, viewYear: date.getFullYear(), viewMonth: date.getMonth() });
    changed ? this.load({ monthChanging: true }) : this.renderCalendar();
  },
  renderCalendar() {
    const year = this.data.viewYear, month = this.data.viewMonth;
    const first = new Date(year, month, 1), offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - offset), todayKey = dateKey(new Date());
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const key = dateKey(date), counts = this.data.monthData[key];
      return { key, day: date.getDate(), inMonth: date.getMonth() === month, isToday: key === todayKey, selected: key === this.data.selectedKey, marker: markerFor(counts) };
    });
    const selectedEntries = this.data.entries.filter(entry => entry.dateKeys.includes(this.data.selectedKey));
    const selectedProjects = selectedEntries.filter(entry => entry.entryType === 'project').sort(projectSort);
    const selectedTasks = selectedEntries.filter(entry => entry.entryType === 'task');
    const counts = this.data.monthData[this.data.selectedKey] || {};
    this.setData({ days, selectedEntries, selectedProjects, selectedTasks, summary: { total: selectedEntries.length, projectCount: selectedProjects.length, taskCount: selectedTasks.length, activeCount: counts.activeCount || 0, completedCount: counts.completedCount || 0 }, monthEntryCount: this.data.entries.length, monthTitle: `${year}年${month + 1}月`, selectedLabel: selectedDateLabel(this.data.selectedKey) });
  },
  onPullDownRefresh() { this.setData({ refreshing: true }); return this.load().finally(() => wx.stopPullDownRefresh()); },
  async openEntry(e) {
    const item = e.currentTarget.dataset.item || (e.detail && e.detail.item);
    if (!item || !item.projectId) return wx.showToast({ title: '目标不存在', icon: 'none' });
    const res = await projectService.get(item.projectId);
    if (!res.success) return wx.showToast({ title: '该备忘录已移入回收站', icon: 'none' });
    const taskQuery = item.entryType === 'task' ? `&taskId=${item.id}` : '';
    wx.navigateTo({ url: `/pages/project-detail/project-detail?id=${item.projectId}${taskQuery}` });
  },
  async toggleTask(e) {
    const item = e.detail.item;
    if (this.data.operatingId || item.isClosedByParent) return;
    this.setData({ operatingId: item.id });
    const res = item.isCompleted ? await taskService.reopen(item.id) : await taskService.complete(item.id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    await this.load();
  }
});

function markerFor(counts) { if (!counts || !counts.total) return ''; if (counts.activeCount > 0) return 'active'; if (counts.completedCount > 0) return 'completed'; return 'muted'; }
function projectSort(a, b) { const order = { active: 0, completed: 1, archived: 2 }; const left = order[a.status] === undefined ? 3 : order[a.status], right = order[b.status] === undefined ? 3 : order[b.status]; return left - right || String(a.startAt || '').localeCompare(String(b.startAt || '')) || a.id.localeCompare(b.id); }
function dateKey(date) { const pad = number => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseKey(key) { const parts = key.split('-').map(Number); return new Date(parts[0], parts[1] - 1, parts[2]); }
function selectedDateLabel(key) { const date = parseKey(key); return `${date.getMonth() + 1}月${date.getDate()}日 星期${['日','一','二','三','四','五','六'][date.getDay()]}`; }
