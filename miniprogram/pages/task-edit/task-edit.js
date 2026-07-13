const taskService = require('../../services/task-service');
const groupService = require('../../services/group-service');
const { validateTaskTitle, validateTaskTime, validateNote } = require('../../utils/validator');

const PRIORITIES = ['core', 'important', 'optional'];

Page({
  data: {
    id: '', projectId: '', title: '', note: '', priority: 'important',
    scheduleType: 'none', dueAt: '', dueTime: '', startAt: '', startTime: '', endAt: '', endTime: '',
    groupId: '', groups: [], saving: false, loading: true, error: '', editMode: false,
    initialized: false, timeError: '', focusedField: ''
  },

  async onLoad(query) {
    const projectId = query.projectId || '';
    const id = query.id || '';
    this.setData({ projectId, id, editMode: !!id, loading: true, error: '' });
    const [groupsOk, taskOk] = await Promise.all([
      this.loadGroups(projectId),
      id ? this.loadTask(id) : Promise.resolve(true)
    ]);
    this.setData({
      loading: false,
      initialized: true,
      error: groupsOk && taskOk ? '' : '表单加载失败，请重新加载'
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
    this.setData({
      title: task.title || '',
      note: task.note || '',
      priority: PRIORITIES.includes(task.priority) ? task.priority : 'important',
      scheduleType: ['none', 'deadline', 'range'].includes(task.scheduleType) ? task.scheduleType : 'none',
      dueAt: due.date, dueTime: due.time,
      startAt: start.date, startTime: start.time,
      endAt: end.date, endTime: end.time,
      groupId: task.groupId || ''
    });
    return true;
  },

  retry() { this.onLoad({ projectId: this.data.projectId, id: this.data.id }); },
  onInput(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  onFocus(e) { this.setData({ focusedField: e.currentTarget.dataset.key }); },
  onBlur() { this.setData({ focusedField: '' }); },
  chooseGroup(e) { this.setData({ groupId: e.currentTarget.dataset.id || '' }); },
  createGroup() { wx.navigateTo({ url: `/pages/group-manage/group-manage?projectId=${this.data.projectId}` }); },
  pickPriority(e) { const value = e.currentTarget.dataset.value; if (PRIORITIES.includes(value)) this.setData({ priority: value }); },

  onSwitchMode(e) {
    const scheduleType = e.currentTarget.dataset.mode;
    if (scheduleType === 'none') {
      this.setData({ scheduleType, dueAt: '', dueTime: '', startAt: '', startTime: '', endAt: '', endTime: '', timeError: '' });
    } else if (scheduleType === 'deadline') {
      this.setData({ scheduleType, dueTime: this.data.dueTime || '18:00', startAt: '', startTime: '', endAt: '', endTime: '', timeError: '' });
    } else {
      this.setData({ scheduleType, dueAt: '', dueTime: '', startTime: this.data.startTime || '09:00', endTime: this.data.endTime || '18:00' }, () => this.validateTimeSelection());
    }
  },

  onPickDate(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }, () => this.validateTimeSelection()); },
  onPickTime(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }, () => this.validateTimeSelection()); },

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
    const error = validateTaskTitle(this.data.title)
      || validateNote(this.data.note)
      || validateTaskTime(startAt, rangeDueAt, dueAt, this.data.scheduleType)
      || this.validateTimeSelection();
    if (error) return wx.showToast({ title: error, icon: 'none' });

    this.setData({ saving: true });
    const payload = {
      projectId: this.data.projectId,
      title: this.data.title.trim(),
      note: this.data.note.trim(),
      priority: this.data.priority,
      scheduleType: this.data.scheduleType,
      dueAt: this.data.scheduleType === 'range' ? rangeDueAt : dueAt,
      startAt,
      groupId: this.data.groupId || null
    };
    let res;
    try {
      res = this.data.id ? await taskService.update(this.data.id, payload) : await taskService.create(payload);
    } catch (errorObject) {
      console.error('[task-edit] save rejected:', errorObject);
      res = { success: false, message: '网络异常，请稍后重试' };
    }
    this.setData({ saving: false });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    wx.showToast({ title: this.data.id ? '任务已更新' : '任务已创建', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
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
