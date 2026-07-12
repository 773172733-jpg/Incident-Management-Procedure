const service = require('../../services/project-service');
const validator = require('../../utils/validator');

Page({
  data: { id: '', title: '', description: '', timeMode: 'none', startAt: '', endAt: '', saving: false, loading: false, error: '', iconType: 'text', iconValue: '', emojis: ['🏠','📚','✏️','🎨','💪','🎵','🌍','🛒','💼','🎮','💡','🌱','🍳','🎬','📷','🔧','🎯','🏃','🌿','💻'] },
  async onLoad(query) {
    if (!query.id) return;
    this.setData({ id: query.id, loading: true, error: '' });
    const res = await service.get(query.id);
    if (!res.success) return this.setData({ loading: false, error: res.message });
    const project = res.data.project;
    this.setData({
      ...project,
      startAt: project.startAt ? new Date(project.startAt).toISOString().slice(0, 10) : '',
      endAt: project.endAt ? new Date(project.endAt).toISOString().slice(0, 10) : '',
      loading: false,
      error: ''
    });
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  mode(e) { this.setData({ timeMode: e.currentTarget.dataset.mode }); },
  chooseIcon(e) { var v=e.currentTarget.dataset.value; this.setData({iconType:'emoji',iconValue:v}); },
  retry() { this.onLoad({ id: this.data.id }); },
  async save() {
    if (this.data.saving) return;
    const error = validator.validateProjectTitle(this.data.title) || validator.validateTimeRange(this.data.startAt, this.data.endAt, this.data.timeMode);
    if (error) return wx.showToast({ title: error, icon: 'none' });
    this.setData({ saving: true });
    const payload = {
      title: this.data.title,
      description: this.data.description,
      timeMode: this.data.timeMode,
      startAt: this.data.startAt,
      endAt: this.data.endAt,
      icon: this.data.icon,
      themeColor: this.data.themeColor,
      iconType: this.data.iconType,
      iconValue: this.data.iconValue
    };
    const res = this.data.id ? await service.update(this.data.id, payload) : await service.create(payload);
    this.setData({ saving: false });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  }
});
