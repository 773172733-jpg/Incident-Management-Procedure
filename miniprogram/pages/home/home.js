const projects = require("../../services/project-service");
const { projectTimeText } = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    filter: "all",
    items: [],
    filters: [
      { key: "all", label: "全部" },
      { key: "active", label: "进行中" },
      { key: "ongoing", label: "无期限" },
      { key: "completed", label: "已结束" }
    ]
  },

  onLoad() {
    console.log("[home] onLoad");
  },

  onShow() {
    console.log("[home] onShow");
    this.load();
  },

  async load() {
    console.log("[home] load start");
    this.setData({ loading: true, error: "" });

    try {
      const res = await projects.list();
      console.log("[home] list result success=" + res.success + " code=" + res.code);

      if (!res.success) {
        console.error("[home] list failed:", res.message);
        this.setData({ loading: false, error: res.message || "加载失败，请重试" });
        return;
      }

      const projectList = res.data && res.data.projects;
      if (!projectList) {
        console.error("[home] list returned no projects array, data:", JSON.stringify(res.data));
        this.setData({ loading: false, error: "数据格式异常，请重试" });
        return;
      }

      const items = projectList.map(p => ({
        ...p,
        timeText: projectTimeText(p),
        progressText: `${p.progressCache || 0}%`,
        countText: `${p.completedTaskCountCache || 0}/${p.taskCountCache || 0}`
      }));

      console.log("[home] loaded " + items.length + " items");
      this.setData({ items, loading: false });

    } catch (err) {
      console.error("[home] load error:", err);
      this.setData({
        loading: false,
        error: "页面加载异常：" + ((err && err.message) || "未知错误")
      });
    }
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
