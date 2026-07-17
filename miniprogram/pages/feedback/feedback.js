const feedbackService = require('../../services/feedback-service');

const APP_VERSION = '1.2.0-beta.1';
const CATEGORY_VALUES = ['bug', 'suggestion', 'other'];

Page({
  data: {
    category: 'bug',
    content: '',
    submitting: false,
    categories: [
      { label: '功能异常', value: 'bug' },
      { label: '使用建议', value: 'suggestion' },
      { label: '其他问题', value: 'other' }
    ]
  },

  onLoad() {
    this._alive = true;
  },

  onUnload() {
    this._alive = false;
  },

  chooseCategory(e) {
    const value = e.currentTarget.dataset.value;
    if (CATEGORY_VALUES.includes(value)) this.setData({ category: value });
  },

  inputContent(e) {
    this.setData({ content: e.detail.value || '' });
  },

  async submit() {
    if (this.data.submitting) return;

    const category = this.data.category;
    const content = (this.data.content || '').trim();
    if (!CATEGORY_VALUES.includes(category)) {
      wx.showToast({ title: '反馈类型无效', icon: 'none' });
      return;
    }
    if (content.length < 5) {
      wx.showToast({ title: '请至少填写5个字', icon: 'none' });
      return;
    }
    if (content.length > 500) {
      wx.showToast({ title: '反馈内容不能超过500个字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    const res = await feedbackService.create({ category, content, appVersion: APP_VERSION });
    if (!this._alive) return;
    this.setData({ submitting: false });

    if (!res.success) {
      wx.showToast({ title: userMessage(res), icon: 'none' });
      return;
    }

    this.setData({ category: 'bug', content: '' });
    wx.showToast({ title: '反馈已提交，感谢你的建议', icon: 'success' });
    setTimeout(() => {
      if (this._alive) wx.navigateBack();
    }, 800);
  }
});

function userMessage(res) {
  if (res && res.code === 'RATE_LIMITED') return '提交太频繁，请稍后再试';
  if (res && res.code === 'INVALID_PARAMS' && res.message) return res.message;
  return '反馈提交失败，请稍后重试';
}
