const activityService = require('../../services/activity-service');
const reminderService = require('../../services/reminder-service');
const projectService = require('../../services/project-service');
const aFmt = require('../../utils/activity-format');
Page({
  data: {
    tab: 'pending', logs: [], page: 1, pageSize: 20, hasMore: false,
    loading: true, refreshing: false, loadingMore: false, error: '', loadMoreError: '', hasLoaded: false,
    filter: 'all',
    filterOptions: [
      { key: 'all', label: '全部' },
      { key: 'project', label: '备忘录' },
      { key: 'task', label: '分支任务' },
      { key: 'group', label: '分组' }
    ],
    dateGroups: [], expandedDateKey: '',
    summary: { overdue: 0, today: 0, upcoming: 0, total: 0 },
    sections: { overdue: [], today: [], upcoming: [] },
    operatingTaskId: '', unreadReminders: [], unreadCount: 0, reminderError: '', markingReminders: false
  },
  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 2 });
    if (this.data.tab === 'pending') this.loadPending(); else this.loadLogs(true);
  },
  onPullDownRefresh() {
    if (this.data.tab === 'pending') this.loadPending(true).finally(function(){wx.stopPullDownRefresh();});
    else this.loadLogs(true).finally(function(){wx.stopPullDownRefresh();});
  },
  onReachBottom() { if (this.data.tab === 'logs') this.loadMore(); },
  chooseTab(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ tab: tab });
    if (tab === 'pending') this.loadPending(); else this.loadLogs(true);
  },
  async loadPending(refreshing) {
    try {
      this.setData({ loading: !this.data.hasLoaded, refreshing: refreshing === true, error: '' });
      var results = await Promise.all([activityService.pending(), reminderService.listUnread()]);
      var res = results[0], reminderRes = results[1];
      if (!res.success) {
        console.error('[activity] pending:', res);
        return this.setData({
          loading: false, refreshing: false, hasLoaded: true,
          error: res.message || '待处理加载失败',
          summary: emptySummary(), sections: emptySections()
        });
      }
      var tFmt = require('../../utils/format');
      var dec = function(t) {
        return { ...t, isCompleted: false, priorityText: tFmt.priorityLabel(t.priority), statusText: t.overdue ? '已逾期' : '待完成', timeText: pendingTimeText(t.dueAt) };
      };
      var data = res.data || {}, sections = data.sections || {};
      var reminders = reminderRes.success ? (reminderRes.data.reminders || []).map(decorateReminder) : [];
      this.setData({
        summary: data.summary || emptySummary(),
        sections: {
          overdue: (sections.overdue || []).map(dec),
          today: (sections.today || []).map(dec),
          upcoming: (sections.upcoming || []).map(dec)
        },
        unreadReminders: reminders,
        unreadCount: reminders.length,
        reminderError: reminderRes.success ? '' : (reminderRes.message || '提醒加载失败'),
        loading: false, refreshing: false, hasLoaded: true, error: ''
      });
    } catch (e) {
      console.error('[activity] pending error:', e);
      this.setData({ loading: false, refreshing: false, hasLoaded: true, error: '待处理加载失败', summary: emptySummary(), sections: emptySections() });
    }
  },
  retry() { if (this.data.tab === 'pending') this.loadPending(); else this.loadLogs(true); },
  openTask(e) {
    var item = e.detail.item;
    if (!item || !item.projectId) return wx.showToast({ title: '所属备忘录已不存在', icon: 'none' });
    wx.navigateTo({
      url: '/pages/project-detail/project-detail?id=' + encodeURIComponent(item.projectId) + '&taskId=' + encodeURIComponent(item._id),
      fail: function() { wx.showToast({ title: '无法打开所属备忘录', icon: 'none' }); }
    });
  },
  async toggleTask(e) {
    if (this.data.operatingTaskId) return;
    var item = e.detail.item;
    this.setData({ operatingTaskId: item._id });
    try {
      var ts = require('../../services/task-service');
      var res = await ts.complete(item._id);
      if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
      await this.loadPending();
    } finally {
      this.setData({ operatingTaskId: '' });
    }
  },
  async openReminder(e) {
    var item = e.currentTarget.dataset.item;
    if (!item || this.data.markingReminders) return;
    this.setData({ markingReminders: true });
    try {
      var res = await reminderService.markRead(item._id);
      if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
      var reminders = this.data.unreadReminders.filter(function(reminder) { return reminder._id !== item._id; });
      this.setData({ unreadReminders: reminders, unreadCount: reminders.length });
      if (!item.projectId) return wx.showToast({ title: '所属备忘录已不存在', icon: 'none' });
      var projectRes = await projectService.get(item.projectId);
      if (!projectRes.success) return wx.showToast({ title: '所属备忘录已不存在', icon: 'none' });
      wx.navigateTo({ url: '/pages/project-detail/project-detail?id=' + encodeURIComponent(item.projectId) + '&taskId=' + encodeURIComponent(item.taskId) });
    } finally { this.setData({ markingReminders: false }); }
  },
  async markAllRemindersRead() {
    if (!this.data.unreadCount || this.data.markingReminders) return;
    this.setData({ markingReminders: true });
    try {
      var res = await reminderService.markAllRead();
      if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
      this.setData({ unreadReminders: [], unreadCount: 0 });
      wx.showToast({ title: '已全部标为已读', icon: 'success' });
    } finally { this.setData({ markingReminders: false }); }
  },
  async loadLogs(reset) {
    if (reset) this._logRequestVersion = (this._logRequestVersion || 0) + 1;
    var requestVersion = this._logRequestVersion || 0;
    var page = reset ? 1 : this.data.page;
    try {
      if (reset) this.setData({ logs: [], dateGroups: [], expandedDateKey: '', page: 1, hasMore: false, loadMoreError: '' });
      if (page < 1) page = 1;
      this.setData({ loading: page===1, loadingMore: page>1, error: '', loadMoreError: '' });
      var res = await activityService.list({ page, pageSize: this.data.pageSize, type: this.data.filter });
      if (requestVersion !== (this._logRequestVersion || 0)) return;
      if (!res.success) {
        console.error('[activity] logs:', res);
        if (page===1) this.setData({ loading: false, error: res.message||'操作记录加载失败' });
        else this.setData({ loadingMore: false, loadMoreError: res.message||'加载更多失败' });
        return;
      }
      var d = res.data||{}; var nl = d.list||[];
      var logs = aFmt.mergeUniqueLogs(page===1 ? [] : this.data.logs, nl);
      this.setData({ logs: logs, hasMore: !!d.hasMore, page: page+1, loading: false, loadingMore: false, loadMoreError: '' });
      this.buildDateGroups(page===1);
    } catch (e) {
      if (requestVersion !== (this._logRequestVersion || 0)) return;
      console.error('[activity] logs error:', e);
      if (page===1) this.setData({ loading: false, error: '操作记录加载失败' });
      else this.setData({ loadingMore: false, loadMoreError: '加载更多失败' });
    }
  },
  loadMore() { if (this.data.loadingMore || !this.data.hasMore) return; this.loadLogs(false); },
  chooseFilter(e) { this.setData({ filter: e.currentTarget.dataset.key }); this.loadLogs(true); },
  buildDateGroups(reset) {
    var groups = aFmt.groupLogsByDay(this.data.logs).map(function(group) {
      return {
        ...group,
        items: group.items.map(function(log) {
          var meta = aFmt.getMeta(log.action);
          return { id: log.id, action: log.action, icon: meta.icon, tone: meta.tone, label: meta.label, title: log.title, projectTitle: log.projectTitle, targetType: log.targetType, targetId: log.targetId, projectId: log.projectId, taskId: log.taskId, groupId: log.groupId, changeText: aFmt.formatChanges(log.before, log.after), timeText: aFmt.formatTimeText(log.createdAt), canNavigate: log.canNavigate, targetExists: log.targetExists };
        })
      };
    });
    var expandedDateKey = aFmt.resolveExpandedDateKey(groups, this.data.expandedDateKey, reset === true);
    this.setData({ dateGroups: groups, expandedDateKey: expandedDateKey });
  },
  toggleDateGroup(e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ expandedDateKey: this.data.expandedDateKey === key ? '' : key });
  },
  goToTarget(e) {
    var item = e.currentTarget.dataset.item;
    if (!item || !item.canNavigate) { if (!item.targetExists) wx.showToast({ title: '该内容已不存在', icon: 'none' }); return; }
    if (item.targetType==='project') wx.navigateTo({ url: '/pages/project-detail/project-detail?id='+item.projectId });
    else if (item.targetType==='task') wx.navigateTo({ url: '/pages/project-detail/project-detail?id='+item.projectId });
    else if (item.targetType==='group') wx.navigateTo({ url: '/pages/group-manage/group-manage?projectId='+item.projectId });
  },
  retryLoadMore() { this.loadMore(); }
});

function emptySummary() { return { overdue: 0, today: 0, upcoming: 0, total: 0 }; }
function emptySections() { return { overdue: [], today: [], upcoming: [] }; }
function pendingTimeText(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return '截止时间待确认';
  var pad = function(number) { return String(number).padStart(2, '0'); };
  return '截止 ' + (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function decorateReminder(item) {
  var dueAt = new Date(item.dueAt), scheduledAt = new Date(item.scheduledAt), triggeredAt = new Date(item.triggeredAt);
  return {
    ...item,
    taskTitle: item.taskTitleSnapshot || '未命名分支任务',
    projectTitle: item.projectTitleSnapshot || '原备忘录',
    scheduledText: validTimeText(scheduledAt, '计划'),
    triggeredText: validTimeText(triggeredAt, '触发'),
    overdue: !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now()
  };
}
function validTimeText(date, prefix) {
  if (Number.isNaN(date.getTime())) return prefix + '时间待确认';
  var pad = function(number) { return String(number).padStart(2, '0'); };
  return prefix + ' ' + (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
