const projects = require("../../services/project-service");
const tasks = require("../../services/task-service");
const { projectTimeText, progressText, statusLabel, priorityLabel, taskTimeText } = require("../../utils/format");
const { projectIconView } = require("../../constants/project-icons");

// 新建按钮按压回弹接近结束时再跳转（单个定时器，不叠加）
const CREATE_NAVIGATE_DELAY = 170;

function buildProgressFillStyle(progressValue) {
  if (progressValue >= 100) return "background:#F28C28";
  return "background:linear-gradient(90deg,#FFD8A8 0%,#F7B267 45%,#F28C28 100%)";
}

Page({
  data: {
    loading: true,
    error: "",
    filter: "all",
    items: [],
    visibleItems: [],
    expandedId: "",
    stats: { active: 0, completed: 0 },
    filters: [
      { key: "all", label: "全部" },
      { key: "active", label: "进行中" },
      { key: "ongoing", label: "无期限" },
      { key: "completed", label: "已结束" }
    ]
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 0 });
    this._createLocked = false;
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: "" });

    const res = await projects.list({
      excludeArchived: true,
      includeTaskStats: true
    });
    if (!res || !res.success) {
      this.setData({
        loading: false,
        error: res && res.message ? res.message : "加载失败，请稍后重试"
      });
      return;
    }

    const rawItems = (res.data && res.data.projects) ? res.data.projects : [];
    const items = rawItems.map(function(item) {
      const completed = Number(item.completedTaskCount !== undefined
        ? item.completedTaskCount
        : item.completedTaskCountCache) || 0;
      const total = Number(item.taskCount !== undefined
        ? item.taskCount
        : item.taskCountCache) || 0;
      const progressValue = Number(item.progressCache) || 0;
      const iconView = projectIconView(item, (item.title || '事').slice(0, 1));
      return {
        ...item,
        _id: item._id,
        title: item.title,
        status: item.status,
        timeMode: item.timeMode,
        startAt: item.startAt,
        endAt: item.endAt,
        progressCache: item.progressCache,
        taskCountCache: total,
        completedTaskCountCache: completed,
        timeText: projectTimeText(item),
        progressText: progressText(completed, total),
        countText: completed + "/" + total,
        ...iconView,
        progressValue,
        progressFillStyle: buildProgressFillStyle(progressValue),
        statusText: statusLabel(item.status),
        allBranchesCompleted: item.allBranchesCompleted === true,
        previewLoaded: false,
        previewLoading: false,
        previewError: false,
        previewTasks: [],
        previewSummary: null,
        recentText: item.status === 'completed'
          ? '已结束 · 已完成 ' + completed + '/' + total
          : (item.nearestTaskTitle || '暂无临近任务')
      };
    });
    const stats = {
      active: items.filter(item => item.status === 'active').length,
      completed: items.filter(item => item.status === 'completed').length
    };
    this.setData({ loading: false, items, stats });
    this.applyFilter();
    this.refreshExpandedPreview();
  },

  // 返回首页后保持展开状态，并重新拉取该备忘录的分支预览
  refreshExpandedPreview() {
    const expandedId = this.data.expandedId;
    if (!expandedId) return;
    if (!this.data.items.some(item => item._id === expandedId)) {
      this.setData({ expandedId: "" });
      return;
    }
    this.loadPreview(expandedId);
  },

  chooseFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  applyFilter() {
    const filter = this.data.filter;
    const visibleItems = this.data.items.filter(item => {
      if (filter === 'all') return true;
      if (filter === 'ongoing') return item.timeMode === 'ongoing' || item.timeMode === 'none';
      return item.status === filter;
    });
    this.setData({ visibleItems });
  },

  create() {
    if (this._createLocked) return;
    this._createLocked = true;
    setTimeout(() => {
      wx.navigateTo({
        url: "/pages/project-edit/project-edit",
        fail: () => { this._createLocked = false; }
      });
    }, CREATE_NAVIGATE_DELAY);
  },

  detail(e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/project-detail/project-detail?id=" + id });
  },

  // 同一时间最多展开一个备忘录
  togglePreview(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.expandedId === id) {
      this.setData({ expandedId: "" });
      return;
    }
    this.setData({ expandedId: id });
    const item = this.data.items.find(project => project._id === id);
    if (item && !item.previewLoaded && !item.previewLoading) this.loadPreview(id);
  },

  async loadPreview(id) {
    const item = this.data.items.find(project => project._id === id);
    if (!item || item.previewLoading) return;

    this.updateProjectItem(id, { previewLoading: true, previewError: false });
    const res = await tasks.listByProject(id, { preview: true, limit: 6 });
    if (!res || !res.success) {
      this.updateProjectItem(id, { previewLoading: false, previewError: true });
      return;
    }

    const data = res.data || {};
    const previewTasks = (data.tasks || []).map(task => ({
      ...task,
      priorityText: priorityLabel(task.priority),
      timeText: taskTimeText(task) || "未设置时间",
      statusText: statusLabel(task.status),
      isCompleted: task.status === "completed"
    }));
    this.updateProjectItem(id, {
      previewLoading: false,
      previewLoaded: true,
      previewError: false,
      previewTasks,
      previewSummary: {
        totalTaskCount: Number(data.totalTaskCount) || 0,
        completedTaskCount: Number(data.completedTaskCount) || 0,
        unfinishedTaskCount: Number(data.unfinishedTaskCount) || 0,
        hasMore: data.hasMore === true
      },
      allBranchesCompleted: data.allBranchesCompleted === true
    });
  },

  openPreviewTask(e) {
    const projectId = e.currentTarget.dataset.projectId;
    const taskId = e.currentTarget.dataset.taskId;
    wx.navigateTo({
      url: "/pages/project-detail/project-detail?id="
        + encodeURIComponent(projectId)
        + "&taskId="
        + encodeURIComponent(taskId)
    });
  },

  retryPreview(e) {
    const id = e.currentTarget.dataset.id;
    return this.loadPreview(id);
  },

  updateProjectItem(id, patch) {
    const items = this.data.items.map(item => item._id === id ? { ...item, ...patch } : item);
    this.setData({ items });
    this.applyFilter();
  },

  retry() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  }
});
