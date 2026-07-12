const projects = require("../../services/project-service");
const { projectTimeText } = require("../../utils/format");

Page({
  data: {
    loading: false,
    error: "",
    filter: "all",
    items: [
      {
        _id: "test1",
        title: "测试事件 - 学习微信小程序",
        status: "active",
        timeMode: "ongoing",
        startAt: "2026-07-01",
        progressCache: 60,
        taskCountCache: 5,
        completedTaskCountCache: 3,
        timeText: "持续进行 · 已持续11 天",
        progressText: "60%",
        countText: "3/5"
      },
      {
        _id: "test2",
        title: "测试事件 - 完成项目文档",
        status: "completed",
        timeMode: "range",
        startAt: "2026-06-01",
        endAt: "2026-07-10",
        progressCache: 100,
        taskCountCache: 8,
        completedTaskCountCache: 8,
        timeText: "2026.06.01—2026.07.10",
        progressText: "100%",
        countText: "8/8"
      }
    ],
    filters: [
      { key: "all", label: "全部" },
      { key: "active", label: "进行中" },
      { key: "ongoing", label: "无期限" },
      { key: "completed", label: "已结束" }
    ]
  },

  onLoad() {
    console.log("[home] onLoad - hardcoded test data mode");
    console.log("[home] items:", JSON.stringify(this.data.items));
    console.log("[home] loading:", this.data.loading);
    console.log("[home] filter:", this.data.filter);
  },

  onShow() {
    console.log("[home] onShow");
  },

  async load() {
    console.log("[home] load called, items count:", this.data.items.length);
    // No-op: using hardcoded data for testing
  },

  chooseFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
  },

  create() {
    console.log("[home] create navigate");
    wx.navigateTo({ url: "/pages/project-edit/project-edit" });
  },

  detail(e) {
    const id = e.currentTarget.dataset.id;
    console.log("[home] detail navigate id=" + id);
    wx.navigateTo({ url: "/pages/project-detail/project-detail?id=" + id });
  },

  retry() {
    console.log("[home] retry");
    this.load();
  }
});
