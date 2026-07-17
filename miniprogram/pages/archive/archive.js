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
      iconText: item.iconValue || (item.title || '事').slice(0, 1),
      timeText: projectTimeText(item),
      stateText: item.completedAt ? '已结束并归档' : '已归档',
      primaryText: item.completedAt ? '重新打开' : '恢复',
      progressValue: Math.max(0, Math.min(100, Number(item.progressCache) || 0)),
      extraText: `归档于 ${formatDateTime(item.archivedAt || item.updatedAt)}`
    }));
    this.setData({ items, loading: false, error: '' });
  },
  retry() { this.load(); },
  async restore(e) {
    const item = e.detail.item;
    if (this.data.operatingId) return;
    const ended = Boolean(item.completedAt);
    const confirmed = await confirmModal(
      ended ? '重新打开备忘录' : '恢复备忘录',
      ended
        ? '重新打开后，因备忘录结束而关闭的分支任务将恢复，备忘录会重新出现在首页。'
        : '恢复后，该备忘录会重新出现在首页。'
    );
    if (!confirmed) return;
    this.setData({ operatingId: item._id });
    const res = ended
      ? await projectService.reopen(item._id)
      : await projectService.restoreFromArchive(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ items: this.data.items.filter(project => project._id !== item._id) });
    wx.showToast({ title: ended ? '备忘录已重新打开' : '备忘录已恢复', icon: ended ? 'none' : 'success' });
  },
  async remove(e) {
    const item = e.detail.item;
    if (this.data.operatingId) return;
    const confirmed = await confirmModal('删除备忘录', `确定将该备忘录移入回收站吗？`, '#F04A4A');
    if (!confirmed) return;
    this.setData({ operatingId: item._id });
    const res = await projectService.softDelete(item._id);
    this.setData({ operatingId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ items: this.data.items.filter(project => project._id !== item._id) });
    wx.showToast({ title: '已移入回收站', icon: 'success' });
  }
});

function confirmModal(title, content, confirmColor = '#FF6B35') { return new Promise(resolve => wx.showModal({ title, content, confirmColor, success: result => resolve(!!result.confirm), fail: () => resolve(false) })); }
