const userService = require('../../services/user-service');
const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');

Page({
  data: { user: null, counts: { archived: 0, recycle: 0 }, loading: true, error: '', savingSetting: false, reminderText: '提前30分钟', joinedText: '' },
  onShow() { if (this.getTabBar()) this.getTabBar().setData({ selected: 3 }); this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    const [profileRes, archivedRes, deletedProjectRes, deletedTaskRes] = await Promise.all([
      userService.getProfile(), projectService.list({ status: 'archived' }), projectService.listDeleted(), taskService.listDeleted()
    ]);
    if (!profileRes.success || !archivedRes.success || !deletedProjectRes.success || !deletedTaskRes.success) {
      console.error('[profile] load failed:', { profileRes, archivedRes, deletedProjectRes, deletedTaskRes });
      return this.setData({ loading: false, error: profileRes.message || archivedRes.message || deletedProjectRes.message || deletedTaskRes.message || '个人信息加载失败' });
    }
    const user = profileRes.data.user;
    this.setData({
      user: { ...user, nickname: user.nickname || '微信用户', avatarUrl: user.avatarUrl || '' },
      counts: { archived: (archivedRes.data.projects || []).length, recycle: (deletedProjectRes.data.projects || []).length + (deletedTaskRes.data.tasks || []).length },
      reminderText: reminderLabel(user.defaultReminderMode, user.defaultReminderMinutes),
      joinedText: joinedLabel(user.createdAt), loading: false, error: ''
    });
  },
  retry() { this.load(); },
  archive() { wx.navigateTo({ url: '/pages/archive/archive' }); },
  recycle() { wx.navigateTo({ url: '/pages/recycle-bin/recycle-bin' }); },
  notifications() { wx.navigateTo({ url: '/pages/notification-settings/notification-settings' }); },
  feedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }); },
  privacy() { wx.showModal({ title: '隐私说明', content: '有进度使用云端身份隔离并保存你的个人数据，不会在页面展示敏感身份标识。当你主动提交意见反馈时，我们会收集你填写的反馈内容，以及用于区分用户和防止重复、恶意提交的云端身份标识。相关信息仅用于处理问题和改进产品。', showCancel: false }); },
  about() { wx.showModal({ title: '关于有进度', content: '有进度 V1.2 测试版（1.2.0-beta.1）\n把备忘录拆成可以一步步完成的分支任务。', showCancel: false }); },
  async chooseReminder() {
    if (this.data.savingSetting) return;
    const values = [{ mode: 'none', minutes: 30 }, { mode: 'at_due', minutes: 30 }, { mode: 'offset', minutes: 10 }, { mode: 'offset', minutes: 30 }, { mode: 'offset', minutes: 60 }, { mode: 'offset', minutes: 1440 }];
    const result = await actionSheet(['不默认提醒', '截止时', '提前10分钟', '提前30分钟', '提前1小时', '提前1天']);
    if (result < 0) return;
    const value = values[result];
    await this.saveSettings({ defaultReminderMode: value.mode, defaultReminderMinutes: value.minutes }, { reminderText: reminderLabel(value.mode, value.minutes), 'user.defaultReminderMode': value.mode, 'user.defaultReminderMinutes': value.minutes });
  },
  async changeSink(e) {
    if (this.data.savingSetting) return;
    const value = !!e.detail.value;
    const previous = !!this.data.user.completedTaskSink;
    this.setData({ 'user.completedTaskSink': value });
    const success = await this.saveSettings({ completedTaskSink: value });
    if (!success) this.setData({ 'user.completedTaskSink': previous });
  },
  async saveSettings(settings, localPatch = {}) {
    this.setData({ savingSetting: true });
    const res = await userService.updateSettings(settings);
    this.setData({ savingSetting: false });
    if (!res.success) { wx.showToast({ title: res.message, icon: 'none' }); return false; }
    this.setData(localPatch);
    wx.showToast({ title: res.message || '设置已保存', icon: 'success' });
    return true;
  }
});

function reminderLabel(mode, minutes) { if (mode === 'none') return '不默认提醒'; if (mode === 'at_due') return '截止时'; const map = { 10: '提前10分钟', 30: '提前30分钟', 60: '提前1小时', 1440: '提前1天' }; return map[minutes] || '提前30分钟'; }
function joinedLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '有进度' : `${date.getFullYear()}年${date.getMonth() + 1}月加入`; }
function actionSheet(itemList) { return new Promise(resolve => wx.showActionSheet({ itemList, success: result => resolve(result.tapIndex), fail: () => resolve(-1) })); }
