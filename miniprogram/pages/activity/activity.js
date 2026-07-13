const activityService = require('../../services/activity-service');
const aFmt = require('../../utils/activity-format');
Page({
  data: {
    tab: 'pending', logs: [], page: 1, pageSize: 20, hasMore: false,
    loading: true, refreshing: false, loadingMore: false, error: '', hasLoaded: false,
    filter: 'all',
    filterOptions: [
      { key: 'all', label: '全部' },
      { key: 'project', label: '事件' },
      { key: 'task', label: '任务' },
      { key: 'group', label: '分组' }
    ],
    dateGroups: [],
    summary: { overdue: 0, today: 0, upcoming: 0, total: 0 },
    sections: { overdue: [], today: [], upcoming: [] },
    operatingTaskId: ''
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
      var res = await activityService.pending();
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
      this.setData({
        summary: data.summary || emptySummary(),
        sections: {
          overdue: (sections.overdue || []).map(dec),
          today: (sections.today || []).map(dec),
          upcoming: (sections.upcoming || []).map(dec)
        },
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
    if (!item || !item.projectId) return wx.showToast({ title: '所属事件已不存在', icon: 'none' });
    wx.navigateTo({
      url: '/pages/project-detail/project-detail?id=' + encodeURIComponent(item.projectId) + '&taskId=' + encodeURIComponent(item._id),
      fail: function() { wx.showToast({ title: '无法打开所属事件', icon: 'none' }); }
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
  async loadLogs(reset) {
    try {
      if (reset) this.setData({ logs: [], page: 1, hasMore: false });
      var page = reset ? 1 : this.data.page; if (page < 1) page = 1;
      this.setData({ loading: page===1, loadingMore: page>1, error: '' });
      var res = await activityService.list({ page, pageSize: this.data.pageSize, type: this.data.filter });
      if (!res.success) { console.error('[activity] logs:', res); if (page===1) this.setData({ loading: false, error: res.message||'操作记录加载失败' }); else this.setData({ loadingMore: false }); return; }
      var d = res.data||{}; var nl = d.list||[];
      if (page===1) this.setData({ logs: nl, hasMore: !!d.hasMore, page: page+1, loading: false, loadingMore: false });
      else this.setData({ logs: this.data.logs.concat(nl), hasMore: !!d.hasMore, page: page+1, loading: false, loadingMore: false });
      this.buildDateGroups();
    } catch (e) { console.error('[activity] logs error:', e); this.setData({ loading: false, error: '操作记录加载失败' }); }
  },
  loadMore() { if (this.data.loadingMore || !this.data.hasMore) return; this.loadLogs(false); },
  chooseFilter(e) { this.setData({ filter: e.currentTarget.dataset.key }); this.loadLogs(true); },
  buildDateGroups() {
    var logs = this.data.logs; var groups = []; var cl = ''; var ci = [];
    for (var i=0;i<logs.length;i++) {
      var label = aFmt.formatDateLabel(logs[i].createdAt);
      if (label !== cl) { if (ci.length>0) groups.push({ label: cl, items: ci }); cl = label; ci = []; }
      var meta = aFmt.getMeta(logs[i].action);
      ci.push({ id: logs[i].id, action: logs[i].action, icon: meta.icon, tone: meta.tone, label: meta.label, title: logs[i].title, projectTitle: logs[i].projectTitle, targetType: logs[i].targetType, targetId: logs[i].targetId, projectId: logs[i].projectId, taskId: logs[i].taskId, groupId: logs[i].groupId, changeText: aFmt.formatChanges(logs[i].before, logs[i].after), timeText: aFmt.formatTimeText(logs[i].createdAt), canNavigate: logs[i].canNavigate, targetExists: logs[i].targetExists });
    }
    if (ci.length>0) groups.push({ label: cl, items: ci });
    this.setData({ dateGroups: groups });
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
