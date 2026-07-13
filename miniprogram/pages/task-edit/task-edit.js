const taskService = require('../../services/task-service');
const groupService = require('../../services/group-service');
const userService = require('../../services/user-service');
const reminderService = require('../../services/reminder-service');
const { WECHAT_SUBSCRIPTION_TEMPLATE } = require('../../constants/wechat-subscription');
const { validateTaskTitle, validateTaskTime, validateNote } = require('../../utils/validator');

const PRIORITIES = ['core', 'important', 'optional'];

Page({
  data: {
    id: '', projectId: '', title: '', note: '', priority: 'important',
    scheduleType: 'none', dueAt: '', dueTime: '', startAt: '', startTime: '', endAt: '', endTime: '',
    reminderMode: 'none', reminderOffsetMinutes: 30, reminderCustomDate: '', reminderCustomTime: '',
    wechatReminderEnabled: false,
    wechatReminderAvailable: WECHAT_SUBSCRIPTION_TEMPLATE.enabled,
    reminderOptions: [
      { mode: 'none', label: '不提醒' }, { mode: 'at_due', label: '截止时' },
      { mode: 'offset', minutes: 10, label: '提前10分钟' }, { mode: 'offset', minutes: 30, label: '提前30分钟' },
      { mode: 'offset', minutes: 60, label: '提前1小时' }, { mode: 'offset', minutes: 1440, label: '提前1天' },
      { mode: 'custom', label: '自定义' }
    ],
    groupId: '', groups: [], saving: false, loading: true, error: '', editMode: false,
    initialized: false, timeError: '', focusedField: ''
  },

  async onLoad(query) {
    const projectId = query.projectId || '';
    const id = query.id || '';
    this.setData({ projectId, id, editMode: !!id, loading: true, error: '' });
    const [groupsOk, taskOk, reminderOk] = await Promise.all([
      this.loadGroups(projectId),
      id ? this.loadTask(id) : Promise.resolve(true),
      id ? Promise.resolve(true) : this.loadDefaultReminder()
    ]);
    this.setData({
      loading: false,
      initialized: true,
      error: groupsOk && taskOk && reminderOk ? '' : '表单加载失败，请重新加载'
    });
  },

  onShow() {
    if (this.data.initialized && this.data.projectId) this.loadGroups(this.data.projectId);
  },

  async loadGroups(projectId) {
    const res = await groupService.list(projectId);
    if (!res.success) {
      console.error('[task-edit] group.list failed:', res);
      return false;
    }
    const groups = res.data.groups || [];
    const groupId = this.data.groupId && !groups.some(group => group._id === this.data.groupId) ? '' : this.data.groupId;
    this.setData({ groups, groupId });
    return true;
  },

  async loadTask(taskId) {
    const res = await taskService.get(taskId);
    if (!res.success) {
      console.error('[task-edit] task.get failed:', res);
      return false;
    }
    const task = res.data.task;
    const effectiveDueAt = task.dueAt || task.endAt;
    const due = dateTimeParts(task.scheduleType === 'deadline' ? effectiveDueAt : null);
    const start = dateTimeParts(task.startAt);
    const end = dateTimeParts(task.scheduleType === 'range' ? effectiveDueAt : null);
    const custom = dateTimeParts(task.reminderCustomAt);
    const wechatRes = await reminderService.getWechatSubscriptionByTask(taskId).catch(() => ({ success: false }));
    const wechatReminder = wechatRes.success ? wechatRes.data.reminder : null;
    this.setData({
      title: task.title || '',
      note: task.note || '',
      priority: PRIORITIES.includes(task.priority) ? task.priority : 'important',
      scheduleType: ['none', 'deadline', 'range'].includes(task.scheduleType) ? task.scheduleType : 'none',
      dueAt: due.date, dueTime: due.time,
      startAt: start.date, startTime: start.time,
      endAt: end.date, endTime: end.time,
      reminderMode: task.reminderMode || 'none',
      reminderOffsetMinutes: task.reminderOffsetMinutes || 30,
      reminderCustomDate: custom.date, reminderCustomTime: custom.time,
      groupId: task.groupId || '',
      wechatReminderEnabled: !!(wechatReminder && ['pending', 'processing', 'failed'].includes(wechatReminder.status))
    });
    return true;
  },

  async loadDefaultReminder() {
    try {
      const res = await userService.getProfile();
      if (!res.success) {
        console.warn('[task-edit] default reminder unavailable:', res.message || res.code);
        return true;
      }
      const user = res.data.user || {};
      const mode = user.defaultReminderMode || 'offset';
      this.setData({ reminderMode: mode, reminderOffsetMinutes: user.defaultReminderMinutes || 30 });
    } catch (error) {
      console.warn('[task-edit] default reminder failed:', error.message);
    }
    return true;
  },

  retry() { this.onLoad({ projectId: this.data.projectId, id: this.data.id }); },
  onInput(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  onFocus(e) { this.setData({ focusedField: e.currentTarget.dataset.key }); },
  onBlur() { this.setData({ focusedField: '' }); },
  chooseGroup(e) { this.setData({ groupId: e.currentTarget.dataset.id || '' }); },
  createGroup() { wx.navigateTo({ url: `/pages/group-manage/group-manage?projectId=${this.data.projectId}` }); },
  pickPriority(e) { const value = e.currentTarget.dataset.value; if (PRIORITIES.includes(value)) this.setData({ priority: value }); },
  pickReminder(e) {
    if (this.data.scheduleType === 'none') return wx.showToast({ title: '请先设置任务时间', icon: 'none' });
    const mode = e.currentTarget.dataset.mode;
    const minutes = Number(e.currentTarget.dataset.minutes) || null;
    this.setData({
      reminderMode: mode,
      ...(mode === 'offset' ? { reminderOffsetMinutes: minutes } : {}),
      ...(mode === 'none' ? { wechatReminderEnabled: false } : {})
    });
  },

  onSwitchMode(e) {
    const scheduleType = e.currentTarget.dataset.mode;
    if (scheduleType === 'none') {
      this.setData({ scheduleType, dueAt: '', dueTime: '', startAt: '', startTime: '', endAt: '', endTime: '', reminderMode: 'none', reminderCustomDate: '', reminderCustomTime: '', wechatReminderEnabled: false, timeError: '' });
    } else if (scheduleType === 'deadline') {
      this.setData({ scheduleType, dueTime: this.data.dueTime || '18:00', startAt: '', startTime: '', endAt: '', endTime: '', timeError: '' });
    } else {
      this.setData({ scheduleType, dueAt: '', dueTime: '', startTime: this.data.startTime || '09:00', endTime: this.data.endTime || '18:00' }, () => this.validateTimeSelection());
    }
  },

  onPickDate(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }, () => this.validateTimeSelection()); },
  onPickTime(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }, () => this.validateTimeSelection()); },
  toggleWechatReminder(e) {
    if (this.data.scheduleType === 'none' || this.data.reminderMode === 'none') {
      return wx.showToast({ title: '请先设置提醒时间', icon: 'none' });
    }
    this.setData({ wechatReminderEnabled: !!e.detail.value });
  },

  validateTimeSelection() {
    if (this.data.scheduleType !== 'range' || !this.data.startAt || !this.data.endAt) {
      this.setData({ timeError: '' });
      return '';
    }
    const start = combineDateTime(this.data.startAt, this.data.startTime || '00:00');
    const end = combineDateTime(this.data.endAt, this.data.endTime || '00:00');
    const error = new Date(end).getTime() < new Date(start).getTime() ? '结束时间不得早于开始时间' : '';
    this.setData({ timeError: error });
    if (error) wx.showToast({ title: error, icon: 'none' });
    return error;
  },

  async onSave() {
    if (this.data.saving) return;
    const dueAt = this.data.scheduleType === 'deadline' ? combineDateTime(this.data.dueAt, this.data.dueTime || '00:00') : undefined;
    const startAt = this.data.scheduleType === 'range' ? combineDateTime(this.data.startAt, this.data.startTime || '00:00') : undefined;
    const rangeDueAt = this.data.scheduleType === 'range' ? combineDateTime(this.data.endAt, this.data.endTime || '00:00') : undefined;
    const reminderCustomAt = this.data.reminderMode === 'custom' ? combineDateTime(this.data.reminderCustomDate, this.data.reminderCustomTime || '00:00') : undefined;
    const error = validateTaskTitle(this.data.title)
      || validateNote(this.data.note)
      || validateTaskTime(startAt, rangeDueAt, dueAt, this.data.scheduleType)
      || this.validateTimeSelection();
    if (error) return wx.showToast({ title: error, icon: 'none' });

    const payload = {
      projectId: this.data.projectId,
      title: this.data.title.trim(),
      note: this.data.note.trim(),
      priority: this.data.priority,
      scheduleType: this.data.scheduleType,
      dueAt: this.data.scheduleType === 'range' ? rangeDueAt : dueAt,
      startAt,
      reminderMode: this.data.scheduleType === 'none' ? 'none' : this.data.reminderMode,
      reminderOffsetMinutes: this.data.reminderMode === 'offset' ? this.data.reminderOffsetMinutes : null,
      reminderCustomAt,
      groupId: this.data.groupId || null
    };
    const wantsWechatReminder = this.data.wechatReminderAvailable
      && this.data.wechatReminderEnabled
      && payload.scheduleType !== 'none'
      && payload.reminderMode !== 'none';

    this.setData({ saving: true });
    const subscriptionResult = wantsWechatReminder ? await this.requestWechatSubscription() : null;
    let res;
    try {
      res = this.data.id ? await taskService.update(this.data.id, payload) : await taskService.create(payload);
    } catch (errorObject) {
      console.error('[task-edit] save rejected:', errorObject);
      res = { success: false, message: '网络异常，请稍后重试' };
    }
    if (!res.success) {
      this.setData({ saving: false });
      return wx.showToast({ title: res.message, icon: 'none' });
    }
    const taskId = this.data.id || (res.data && res.data.task && res.data.task._id);
    const wechatMessage = await this.syncWechatReminderAfterSave(taskId, wantsWechatReminder, subscriptionResult);
    this.setData({ saving: false });
    if (wechatMessage) wx.showToast({ title: wechatMessage, icon: 'none', duration: 2800 });
    else if (res.data && res.data.reminderWarning) wx.showToast({ title: res.data.reminderWarning, icon: 'none', duration: 2500 });
    else wx.showToast({ title: this.data.id ? '任务已更新' : '任务已创建', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  },

  requestWechatSubscription() {
    if (!WECHAT_SUBSCRIPTION_TEMPLATE.enabled || !WECHAT_SUBSCRIPTION_TEMPLATE.id) {
      return Promise.resolve({ status: 'not_configured' });
    }
    if (!wx.requestSubscribeMessage) return Promise.resolve({ status: 'unsupported' });
    return new Promise(resolve => {
      wx.requestSubscribeMessage({
        tmplIds: [WECHAT_SUBSCRIPTION_TEMPLATE.id],
        success: res => {
          const value = res && res[WECHAT_SUBSCRIPTION_TEMPLATE.id];
          if (value === 'accept') resolve({ status: 'accept' });
          else if (value === 'ban') resolve({ status: 'ban' });
          else resolve({ status: 'reject' });
        },
        fail: err => {
          const message = String((err && (err.errMsg || err.message)) || '');
          resolve({ status: /ban|setting/i.test(message) ? 'ban' : 'failed', message });
        }
      });
    });
  },

  async syncWechatReminderAfterSave(taskId, wantsWechatReminder, subscriptionResult) {
    if (!taskId) return '';
    if (!wantsWechatReminder) {
      await reminderService.cancelWechatSubscription(taskId).catch(() => null);
      return '';
    }
    if (!subscriptionResult || subscriptionResult.status === 'not_configured') return '微信提醒暂未配置，小程序内提醒仍然有效';
    if (subscriptionResult.status === 'unsupported') return '当前微信版本暂不支持服务通知，小程序内提醒仍然有效';
    if (subscriptionResult.status === 'reject') return '任务已保存。你未允许微信服务通知，小程序内提醒仍然有效';
    if (subscriptionResult.status === 'ban') return '任务已保存。微信服务通知已被关闭，可在小程序设置中重新开启';
    if (subscriptionResult.status !== 'accept') return '任务已保存，但微信提醒开启失败，请稍后重试';
    try {
      const res = await reminderService.upsertWechatSubscription(taskId, {
        templateId: WECHAT_SUBSCRIPTION_TEMPLATE.id,
        authorizationResult: 'accept'
      });
      return res.success ? '任务已保存，微信提醒已开启' : '任务已保存，但微信提醒开启失败，请稍后重试';
    } catch (error) {
      console.warn('[task-edit] wechat reminder upsert failed:', error && error.message);
      return '任务已保存，但微信提醒开启失败，请稍后重试';
    }
  }
});

function dateTimeParts(value) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  const pad = number => String(number).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function combineDateTime(date, time) {
  if (!date) return undefined;
  return `${date}T${time || '00:00'}:00+08:00`;
}
