const service = require('../../services/project-service');
const validator = require('../../utils/validator');
const {
  DEFAULT_PROJECT_IMAGE_ICON,
  PROJECT_ICON_OPTIONS,
  projectImageIconSrc
} = require('../../constants/project-icons');

function formatLocalDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

Page({
  data: {
    id: '', title: '', description: '', timeMode: 'none', startAt: '', endAt: '',
    saving: false, loading: false, error: '',
    icon: 'circle', iconType: 'image', iconValue: DEFAULT_PROJECT_IMAGE_ICON,
    selectedIconSrc: projectImageIconSrc('image', DEFAULT_PROJECT_IMAGE_ICON),
    themeColor: '#FF6B35',
    iconOptions: PROJECT_ICON_OPTIONS,
    themeColors: ['#FF6B35', '#E5484D', '#D97706', '#2E8B57', '#168C8C', '#3478F6', '#6E56CF', '#6B7280']
  },
  async onLoad(query) {
    if (!query.id) return;
    this.setData({ id: query.id, loading: true, error: '' });
    const res = await service.get(query.id);
    if (!res.success) return this.setData({ loading: false, error: res.message });
    const project = res.data.project;
    this.setData({
      title: project.title || '',
      description: project.description || '',
      timeMode: project.timeMode || 'none',
      icon: project.icon || 'circle',
      themeColor: project.themeColor || '#FF6B35',
      iconType: project.iconType || 'text',
      iconValue: project.iconValue || '',
      selectedIconSrc: projectImageIconSrc(project.iconType, project.iconValue),
      startAt: project.startAt ? formatLocalDate(project.startAt) : '',
      endAt: project.endAt ? formatLocalDate(project.endAt) : '',
      loading: false,
      error: ''
    });
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  mode(e) {
    const timeMode = e.currentTarget.dataset.mode;
    const dates = timeMode === 'none'
      ? { startAt: '', endAt: '' }
      : timeMode === 'ongoing' ? { endAt: '' } : {};
    this.setData({ timeMode, ...dates });
  },
  chooseIcon(e) {
    const type = e.currentTarget.dataset.type;
    const value = e.currentTarget.dataset.value;
    if (this.data.iconType === type && this.data.iconValue === value) {
      this.setData({ iconType: 'text', iconValue: '', selectedIconSrc: '' });
      return;
    }
    this.setData({
      iconType: type,
      iconValue: value,
      selectedIconSrc: projectImageIconSrc(type, value)
    });
  },
  chooseThemeColor(e) { this.setData({ themeColor: e.currentTarget.dataset.value }); },
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
