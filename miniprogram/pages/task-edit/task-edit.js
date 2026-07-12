/**
 * 事件树 - 分支任务编辑页
 * 支持新建和编辑
 */
const taskService = require('../../services/task-service');
const groupService = require('../../services/group-service');
const { validateTaskTitle, validateTaskTime, validateNote } = require('../../utils/validator');

const PRIORITY_OPTIONS = [
  { value: 'core', label: '核心' },
  { value: 'important', label: '重要' },
  { value: 'optional', label: '可选' }
];

Page({
  data: {
    id: '',
    projectId: '',
    title: '',
    note: '',
    priority: 'important',
    priorityIndex: 1,
    scheduleType: 'none',
    dueAt: '',
    startAt: '',
    endAt: '',
    groupId: '',
    groupIndex: -1,
    groups: [],
    saving: false,
    editMode: false
  },

  onLoad(query) {
    const projectId = query.projectId || '';
    const id = query.id || '';
    this.setData({ projectId, id, editMode: !!id });
    this.loadGroups(projectId);
    if (id) this.loadTask(id);
  },

  async loadGroups(projectId) {
    const res = await groupService.list(projectId);
    if (res.success) {
      const groups = res.data.groups || [];
      this.setData({ groups });
    }
  },

  async loadTask(taskId) {
    const res = await taskService.get(taskId);
    if (!res.success) {
      wx.showToast({ title: res.message, icon: 'none' });
      return;
    }
    const task = res.data.task;
    // 计算当前选择索引
    let priorityIndex = 1;
    if (task.priority === 'core') priorityIndex = 0;
    else if (task.priority === 'optional') priorityIndex = 2;

    this.setData({
      title: task.title || '',
      note: task.note || '',
      priority: task.priority || 'important',
      priorityIndex: priorityIndex,
      scheduleType: task.scheduleType || 'none',
      dueAt: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : '',
      startAt: task.startAt ? new Date(task.startAt).toISOString().slice(0, 10) : '',
      endAt: task.endAt ? new Date(task.endAt).toISOString().slice(0, 10) : '',
      groupId: task.groupId || ''
    });
  },

  // 通用文本输入
  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  // 优先级选择
  onPickPriority(e) {
    const index = Number(e.detail.value);
    const option = PRIORITY_OPTIONS[index];
    if (option) {
      this.setData({
        priorityIndex: index,
        priority: option.value
      });
    }
  },

  // 分组选择
  onPickGroup(e) {
    const index = Number(e.detail.value);
    if (index < 0) {
      this.setData({ groupId: '', groupIndex: -1 });
    } else {
      const group = this.data.groups[index];
      this.setData({
        groupId: group ? group._id : '',
        groupIndex: index
      });
    }
  },

  // 时间模式切换
  onSwitchMode(e) {
    this.setData({ scheduleType: e.currentTarget.dataset.mode });
  },

  // 日期选择
  onPickDate(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  // 保存
  async onSave() {
    if (this.data.saving) return;

    // 前端校验
    const titleErr = validateTaskTitle(this.data.title);
    if (titleErr) return wx.showToast({ title: titleErr, icon: 'none' });

    const noteErr = validateNote(this.data.note);
    if (noteErr) return wx.showToast({ title: noteErr, icon: 'none' });

    const timeErr = validateTaskTime(
      this.data.startAt, this.data.endAt, this.data.dueAt, this.data.scheduleType
    );
    if (timeErr) return wx.showToast({ title: timeErr, icon: 'none' });

    this.setData({ saving: true });

    const payload = {
      projectId: this.data.projectId,
      title: this.data.title.trim(),
      note: this.data.note.trim(),
      priority: this.data.priority,
      scheduleType: this.data.scheduleType,
      dueAt: this.data.scheduleType === 'deadline' ? this.data.dueAt : undefined,
      startAt: this.data.scheduleType === 'range' ? this.data.startAt : undefined,
      endAt: this.data.scheduleType === 'range' ? this.data.endAt : undefined,
      groupId: this.data.groupId || undefined
    };

    const res = this.data.id
      ? await taskService.update(this.data.id, payload)
      : await taskService.create(payload);

    this.setData({ saving: false });

    if (!res.success) {
      return wx.showToast({ title: res.message, icon: 'none' });
    }

    wx.showToast({ title: this.data.id ? '任务已更新' : '任务已创建', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 800);
  }
});
