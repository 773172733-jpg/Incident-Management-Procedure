const activityService = require('../../services/activity-service');
const aFmt = require('../../utils/activity-format');
Page({
  data: {
    tab: 'pending', logs: [], page: 1, pageSize: 20, hasMore: false,
    loading: false, loadingMore: false, error: '',
    filter: 'all',
    filterOptions: [
      { key: 'all', label: '全部' },
      { key: 'project', label: '事件' },
      { key: 'task', label: '任务' },
      { key: 'group', label: '分组' }
    ],
    dateGroups: [],
    tasks: [], todayTasks: [], upcomingTasks: [], overdueTasks: [], operatingId: ''
  },
  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 2 });
    if (this.data.tab === 'pending') this.loadPending(); else this.loadLogs(true);
  },
  onPullDownRefresh() {
    if (this.data.tab === 'pending') this.loadPending().finally(function(){wx.stopPullDownRefresh();});
    else this.loadLogs(true).finally(function(){wx.stopPullDownRefresh();});
  },
  onReachBottom() { if (this.data.tab === 'logs') this.loadMore(); },
  chooseTab(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ tab: tab });
    if (tab === 'pending') this.loadPending(); else this.loadLogs(true);
  },
  async loadPending() {
    this.setData({ loading: true, error: '' });
    var ss = require('../../services/schedule-service');
    var res = await ss.listScheduledTasks();
    if (!res.success) { console.error('[activity] pending:', res); return this.setData({ loading: false, error: res.message||'待处理加载失败' }); }
    var tFmt = require('../../utils/format');
    var dec = function(t) {
      var ic = t.status==='completed'||t.status==='approved';
      var tg = t.dueAt||t.endAt;
      return { ...t, isCompleted: ic, priorityText: tFmt.priorityLabel(t.priority), statusText: tFmt.statusLabel(t.status), timeText: tFmt.projectTimeText(t), overdue: !ic&&t.status!=='closed_by_parent'&&tg&&new Date(tg).getTime()<Date.now() };
    };
    var tasks = (res.data.tasks||[]).map(dec);
    this.setData({ tasks, loading: false, error: '' });
    this.buildPending();
  },
  buildPending() {
    var t = new Date(); t.setHours(0,0,0,0);
    var tm = new Date(t.getTime()+86400000), se = new Date(t.getTime()+4*86400000);
    var act = this.data.tasks.filter(function(x){return !x.isCompleted&&x.status!=='closed_by_parent';});
    var target = function(x){return new Date(x.dueAt||x.endAt);};
    var ow = function(x){return {...x, timeText:'已逾期'+Math.max(1,Math.ceil((Date.now()-target(x).getTime())/86400000))+'天', overdue:true};};
    this.setData({ overdueTasks: act.filter(function(x){return target(x)<t;}).map(ow), todayTasks: act.filter(function(x){return target(x)>=t&&target(x)<tm;}), upcomingTasks: act.filter(function(x){return target(x)>=tm&&target(x)<se;}) });
  },
  retry() { if (this.data.tab === 'pending') this.loadPending(); else this.loadLogs(true); },
  openTask(e) { var item = e.detail.item; wx.navigateTo({ url: '/pages/task-edit/task-edit?projectId='+item.projectId+'&id='+item._id }); },
  async toggleTask(e) { if (this.data.operatingId) return; var item = e.detail.item; this.setData({ operatingId: item._id }); var ts=require('../../services/task-service'); var res=await ts.complete(item._id); this.setData({ operatingId: '' }); if (!res.success) return wx.showToast({ title: res.message, icon: 'none' }); var tasks=this.data.tasks.map(function(t){return t._id===item._id?{...t,status:'completed',completedAt:new Date().toISOString(),isCompleted:true}:t;}); this.setData({ tasks }); this.buildPending(); },
  async loadLogs(reset) {
    if (reset) this.setData({ logs: [], page: 1, hasMore: false });
    var page = reset ? 1 : this.data.page; if (page < 1) page = 1;
    this.setData({ loading: page===1, loadingMore: page>1, error: '' });
    var res = await activityService.list({ page, pageSize: this.data.pageSize, type: this.data.filter });
    if (!res.success) { console.error('[activity] logs:', res); if (page===1) this.setData({ loading: false, error: res.message||'操作记录加载失败' }); else this.setData({ loadingMore: false }); return; }
    var d = res.data||{}; var nl = d.list||[];
    if (page===1) this.setData({ logs: nl, hasMore: !!d.hasMore, page: page+1, loading: false, loadingMore: false });
    else this.setData({ logs: this.data.logs.concat(nl), hasMore: !!d.hasMore, page: page+1, loading: false, loadingMore: false });
    this.buildDateGroups();
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
