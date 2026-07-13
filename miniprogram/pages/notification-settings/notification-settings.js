const userService = require('../../services/user-service');

Page({
  data: { user: null, reminderText: '', loading: true, error: '', saving: false },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    const res = await userService.getProfile();
    if (!res.success) { console.error('[notification-settings] load failed:', res); return this.setData({ loading: false, error: res.message || '通知设置加载失败' }); }
    const user = res.data.user;
    this.setData({ user, reminderText: reminderLabel(user.defaultReminderMinutes), loading: false, error: '' });
  },
  retry() { this.load(); },
  async chooseReminder() {
    if (this.data.saving) return;
    const values = [0, 10, 30, 60, 1440];
    const index = await actionSheet(['不提前', '提前10分钟', '提前30分钟', '提前1小时', '提前1天']);
    if (index < 0) return;
    this.setData({ saving: true });
    const res = await userService.updateSettings({ defaultReminderMinutes: values[index] });
    this.setData({ saving: false });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ reminderText: reminderLabel(values[index]), 'user.defaultReminderMinutes': values[index] });
    wx.showToast({ title: res.message || '设置已保存', icon: 'success' });
  }
});

function reminderLabel(minutes) { const map = { 0: '不提前', 10: '提前10分钟', 30: '提前30分钟', 60: '提前1小时', 1440: '提前1天' }; return map[minutes] || '提前30分钟'; }
function actionSheet(itemList) { return new Promise(resolve => wx.showActionSheet({ itemList, success: result => resolve(result.tapIndex), fail: () => resolve(-1) })); }
