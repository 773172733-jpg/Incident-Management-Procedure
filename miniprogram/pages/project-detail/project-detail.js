const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');
const groupService = require('../../services/group-service');
const format = require('../../utils/format');

Page({
  data: {
    id: '',
    project: null,
    tasks: [],
    filteredTasks: [],
    groups: [],
    groupId: 'all',
    priority: 'all',
    loading: true,
    error: '',
    operatingTaskId: '',
    sorting: false
  },

  onLoad(query) {
    this.setData({ id: query.id || '' });
  },

  onShow() {
    if (this.data.id) this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });

    const [projectRes, taskRes, groupRes] = await Promise.all([
      projectService.get(this.data.id),
      taskService.listByProject(this.data.id),
      groupService.list(this.data.id)
    ]);

    if (!projectRes.success) {
      return this.setData({ loading: false, error: projectRes.message });
    }

    const tasks = taskRes.success ? taskRes.data.tasks.map(function(item) {
      return {
        ...item,
        groupKey: item.groupId || '',
        timeText: format.taskTimeText(item),
        priorityText: format.priorityLabel(item),
        completedText: item.completedAt ? formatDateTime(item.completedAt) + ' 完成' : ''
      };
    }).sort(function(a, b) {
      if (a.groupKey === b.groupKey) {
        const aDone = (a.status === 'completed' || a.status === 'approved') ? 1 : 0;
        const bDone = (b.status === 'completed' || b.status === 'approved') ? 1 : 0;
        return aDone - bDone || a.sortOrder - b.sortOrder;
      }
      return 0;
    }) : [];

    this.setData({
      project: {
        ...projectRes.data.project,
        timeText: format.projectTimeText(projectRes.data.project),
        statusText: format.statusLabel(projectRes.data.project.status),
        iconText: (projectRes.data.project.title || '事').slice(0, 1)
      },
      tasks: tasks,
      groups: groupRes.success ? groupRes.data.groups : [],
      loading: false,
      error: taskRes.success && groupRes.success ? '' : (taskRes.message || groupRes.message)
    });

    this.applyFilters();
  },

  applyFilters() {
    const groupId = this.data.groupId;
    const priority = this.data.priority;
    const filteredTasks = this.data.tasks.filter(function(item) {
      const groupMatch = groupId === 'all' || item.groupKey === groupId;
      const priorityMatch = priority === 'all' || item.priority === priority;
      return groupMatch && priorityMatch;
    });
    this.setData({ filteredTasks: filteredTasks });
  },

  add() {
    wx.navigateTo({ url: '/pages/task-edit/task-edit?projectId=' + this.data.id });
  },

  back() {
    wx.navigateBack({ delta: 1 });
  },

  edit() {
    wx.navigateTo({ url: '/pages/project-edit/project-edit?id=' + this.data.id });
  },

  manageGroups() {
    wx.navigateTo({ url: '/pages/group-manage/group-manage?projectId=' + this.data.id });
  },

  editTask(e) {
    wx.navigateTo({
      url: '/pages/task-edit/task-edit?projectId=' + this.data.id + '&id=' + e.currentTarget.dataset.id
    });
  },

  async deleteTask(e) {
    var task = e.currentTarget.dataset.item;
    var result = await new Promise(function(resolve) {
      wx.showModal({
        title: '删除任务',
        content: '确定将"' + task.title + '"移入回收站吗？',
        confirmColor: '#F04A4A',
        success: resolve
      });
    });
    if (!result.confirm) return;

    var res = await taskService.softDelete(task._id);
    wx.showToast({ title: res.message, icon: res.success ? 'success' : 'none' });
    if (res.success) this.load();
  },

  async toggle(e) {
    var task = e.currentTarget.dataset.item;
    if (this.data.operatingTaskId) return;

    this.setData({ operatingTaskId: task._id });

    var isCompleted = task.status === 'completed' || task.status === 'approved';
    var res = isCompleted
      ? await taskService.reopen(task._id)
      : await taskService.complete(task._id);

    this.setData({ operatingTaskId: '' });

    if (!res.success) {
      wx.showToast({ title: res.message, icon: 'none' });
    }
    this.load();
  },

  async moveTask(e) {
    if (this.data.sorting || this.data.groupId === 'all') return;

    var taskId = e.currentTarget.dataset.id;
    var direction = Number(e.currentTarget.dataset.direction);

    var inGroup = this.data.tasks
      .filter(function(item) { return item.groupKey === this.data.groupId; }.bind(this))
      .sort(function(a, b) { return a.sortOrder - b.sortOrder; });

    var index = inGroup.findIndex(function(item) { return item._id === taskId; });
    var target = index + direction;

    if (index < 0 || target < 0 || target >= inGroup.length) return;

    var temp = inGroup[index];
    inGroup[index] = inGroup[target];
    inGroup[target] = temp;

    this.setData({ sorting: true });

    var res = await taskService.reorder(this.data.id, inGroup.map(function(item) { return item._id; }));

    this.setData({ sorting: false });

    if (!res.success) {
      wx.showToast({ title: res.message, icon: 'none' });
    }
    this.load();
  },

  group(e) {
    this.setData({ groupId: e.currentTarget.dataset.id });
    this.applyFilters();
  },

  priority(e) {
    this.setData({ priority: e.currentTarget.dataset.id });
    this.applyFilters();
  },

  retry() {
    this.load();
  }
});

function formatDateTime(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  var pad = function(number) { return String(number).padStart(2, '0'); };
  return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
