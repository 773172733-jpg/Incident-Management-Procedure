// 事件树 - 全局入口
const eventBus = require('./utils/event-bus');

App({
  onLaunch() {
    const env = require('./constants/config').DB_ENV;
    if (!wx.cloud) {
      const message = '当前基础库不支持云开发，请升级微信客户端或基础库';
      this.globalData.userLoadError = message;
      console.error('[app] cloud unavailable:', message);
      return;
    }

    const cloudOptions = { traceUser: true };
    if (env) cloudOptions.env = env;
    wx.cloud.init(cloudOptions);
    this.initUser();
  },

  globalData: {
    userInfo: null,
    userLoaded: false,
    userLoadError: '',
    userInitPromise: null
  },

  initUser() {
    if (this.globalData.userInitPromise) {
      return this.globalData.userInitPromise;
    }

    const userService = require('./services/user-service');
    this.globalData.userLoadError = '';
    this.globalData.userInitPromise = userService.bootstrap().then(res => {
      if (res.success) {
        this.globalData.userInfo = res.data.user;
        this.globalData.userLoaded = true;
        eventBus.emit('user:ready', res.data.user);
      } else {
        this.globalData.userLoadError = res.message || '用户初始化失败，请稍后重试';
        console.error('[app] bootstrap failed:', res.message);
      }
      return res;
    }).catch(err => {
      this.globalData.userLoadError = '用户初始化失败，请检查网络后重试';
      console.error('[app] bootstrap error:', err);
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: this.globalData.userLoadError,
        data: null
      };
    }).finally(() => {
      this.globalData.userInitPromise = null;
    });

    return this.globalData.userInitPromise;
  }
});
