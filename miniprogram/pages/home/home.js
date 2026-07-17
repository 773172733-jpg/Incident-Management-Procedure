const projects = require("../../services/project-service");
const tasks = require("../../services/task-service");
const { projectTimeText, progressText, statusLabel, priorityLabel, taskTimeText } = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    filter: "all",
    items: [],
    visibleItems: [],
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
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: "" });

    const res = await projects.list({});
    if (!res || !res.success) {
      this.setData({
        loading: false,
        error: res && res.message ? res.message : "加载失败，请稍后重试"
      });
      return;
    }

    const rawItems = (res.data && res.data.projects) ? res.data.projects : [];
    const items = rawItems.map(function(item) {
      const completed = Number(item.completedTaskCountCache) || 0;
      const total = Number(item.taskCountCache) || 0;
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
        iconText: item.iconValue || (item.title || '事').slice(0, 1),
        progressValue: Number(item.progressCache) || 0,
        statusText: statusLabel(item.status),
        allBranchesCompleted: item.allBranchesCompleted === true
          || (total > 0 && completed === total),
        previewExpanded: false,
        previewLoaded: false,
        previewLoading: false,
        previewError: "",
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
    wx.navigateTo({ url: "/pages/project-edit/project-edit" });
  },

  detail(e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/project-detail/project-detail?id=" + id });
  },

  async togglePreview(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find(project => project._id === id);
    if (!item || item.previewLoading) return;

    if (item.previewExpanded) {
      this.updateProjectItem(id, { previewExpanded: false });
      return;
    }
    if (item.previewLoaded) {
      this.updateProjectItem(id, { previewExpanded: true });
      return;
    }

    this.updateProjectItem(id, {
      previewExpanded: true,
      previewLoading: true,
      previewError: ""
    });
    const res = await tasks.listByProject(id, { preview: true, limit: 6 });
    if (!res || !res.success) {
      this.updateProjectItem(id, {
        previewLoading: false,
        previewError: (res && res.message) || "分支任务加载失败"
      });
      return;
    }

    const data = res.data || {};
    const previewTasks = (data.tasks || []).map(task => ({
      ...task,
      priorityText: priorityLabel(task.priority),
      timeText: taskTimeText(task) || "未设置时间",
      statusText: statusLabel(task.status),
      isCompleted: task.status === "completed" || task.status === "approved"
    }));
    this.updateProjectItem(id, {
      previewLoading: false,
      previewLoaded: true,
      previewError: "",
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
    this.updateProjectItem(id, { previewExpanded: false, previewError: "" });
    return this.togglePreview(e);
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
