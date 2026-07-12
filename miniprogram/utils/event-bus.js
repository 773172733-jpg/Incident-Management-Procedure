/**
 * 事件树 - 轻量事件总线
 * 用于页面间通信，代替全局状态管理
 */
class EventBus {
  constructor() {
    this._handlers = {};
  }

  on(event, handler) {
    if (!this._handlers[event]) {
      this._handlers[event] = [];
    }
    this._handlers[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this._handlers[event];
    if (!handlers) return;
    if (!handler) {
      delete this._handlers[event];
      return;
    }
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  emit(event, data) {
    const handlers = this._handlers[event];
    if (!handlers) return;
    handlers.forEach(fn => {
      try { fn(data); } catch (e) { console.error('[EventBus] handler error:', e); }
    });
  }

  /** 只监听一次 */
  once(event, handler) {
    const wrapper = (data) => {
      handler(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

module.exports = new EventBus();
