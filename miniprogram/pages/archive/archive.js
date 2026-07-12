const projectService = require('../../services/project-service');
const { projectTimeText } = require('../../utils/format');
const { formatDateTime } = require('../../utils/date');

Page({
  data: { items: [], loading: true, error: '', operatingId: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    const res = await projectService.list({ status: 'archived' });
    if (!res.success) { console.error('[archive] list failed:', res); return this.setData({ loading: false, error: res.message || '归档列表加载失败' }); }
    const items = (res.data.projects || []).map(item => ({
      ...item,
      iconText: (item.title || '事').slice(0, 1),
      timeText: projectTimeText(item),
      stateText: '已归档',
      progressValue: Math.max(0, Math.min(100, Number(item.progressCache) || 0)),
      extraText: `归档于 ${formatDateTime(item.archivedAt || item.updatedAt)}`
    }));
    this.setData({ items, loading: false, error: '' });
  },
  retry() { this.load(); },
  async restore(e) {
    const item = e.detail.item;
    if (this.data.operatingId) return;
    const confirmed = await confirmModal('恢复事件', '恢复后，该事件会重新出现在首页。');
    if (!confirmed) return;
    this.setData({ operatingId: item._id });
    const res = await projectService.restoreFromArchive(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ items: this.data.items.filter(project => project._id !== item._id) });
    wx.showToast({ title: res.message, icon: 'success' });
  },
  async remove(e) {
    const item = e.detail.item;
    if (this.data.operatingId) return;
    const confirmed = await confirmModal('删除事件', `确定将“${item.title}”移入回收站吗？`, '#F04A4A');
    if (!confirmed) return;
    this.setData({ operatingId: item._id });
    const res = await projectService.softDelete(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ items: this.data.items.filter(project => project._id !== item._id) });
    wx.showToast({ title: res.message, icon: 'success' });
  }
});

function confirmModal(title, content, confirmColor = '#FF6B35') { return new Promise(resolve => wx.showModal({ title, content, confirmColor, success: result => resolve(!!result.confirm), fail: () => resolve(false) })); }
