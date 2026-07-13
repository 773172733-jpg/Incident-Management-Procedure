const userService = require('../../services/user-service');

Page({
  data: { user: null, reminderText: '', loading: true, error: '', saving: false },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    const res = await userService.getProfile();
    if (!res.success) { console.error('[notification-settings] load failed:', res); return this.setData({ loading: false, error: res.message || '通知设置加载失败' }); }
    const user = res.data.user;
    this.setData({ user, reminderText: reminderLabel(user.defaultReminderMode, user.defaultReminderMinutes), loading: false, error: '' });
  },
  retry() { this.load(); },
  async chooseReminder() {
    if (this.data.saving) return;
    const values = [
      { mode: 'none', minutes: 30 }, { mode: 'at_due', minutes: 30 },
      { mode: 'offset', minutes: 10 }, { mode: 'offset', minutes: 30 },
      { mode: 'offset', minutes: 60 }, { mode: 'offset', minutes: 1440 }
    ];
    const index = await actionSheet(['不默认提醒', '截止时', '提前10分钟', '提前30分钟', '提前1小时', '提前1天']);
    if (index < 0) return;
    this.setData({ saving: true });
    const value = values[index];
    const res = await userService.updateSettings({ defaultReminderMode: value.mode, defaultReminderMinutes: value.minutes });
    this.setData({ saving: false });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ reminderText: reminderLabel(value.mode, value.minutes), 'user.defaultReminderMode': value.mode, 'user.defaultReminderMinutes': value.minutes });
    wx.showToast({ title: res.message || '设置已保存', icon: 'success' });
  }
});

function reminderLabel(mode, minutes) { if (mode === 'none') return '不默认提醒'; if (mode === 'at_due') return '截止时'; const map = { 10: '提前10分钟', 30: '提前30分钟', 60: '提前1小时', 1440: '提前1天' }; return map[minutes] || '提前30分钟'; }
function actionSheet(itemList) { return new Promise(resolve => wx.showActionSheet({ itemList, success: result => resolve(result.tapIndex), fail: () => resolve(-1) })); }
