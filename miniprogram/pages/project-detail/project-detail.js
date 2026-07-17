const projectService = require('../../services/project-service');
const taskService = require('../../services/task-service');
const groupService = require('../../services/group-service');
const format = require('../../utils/format');
const { getEffectiveDueAt, isTaskOverdue } = require('../../utils/task-time');
const { projectIconView } = require('../../constants/project-icons');

Page({
  data: {
    id: '', targetTaskId: '', project: null, tasks: [], filteredTasks: [], groups: [], groupTabs: [],
    groupId: 'all', priority: 'all', hasActiveFilter: false,
    priorityOptions: [
      { value: 'all', label: '全部', tone: 'primary' },
      { value: 'core', label: '核心', tone: 'core' },
      { value: 'important', label: '重要', tone: 'important' },
      { value: 'optional', label: '可选', tone: 'optional' }
    ],
    loading: true, error: '', operatingTaskId: '', sorting: false,
    navStyle: ''
  },

  onLoad(query) {
    const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBar = system.statusBarHeight || 20;
    const navHeight = menu ? (menu.top - statusBar) * 2 + menu.height : 44;
    const right = menu ? Math.max(96, system.windowWidth - menu.left + 8) : 16;
    this.setData({
      id: query.id || '',
      targetTaskId: query.taskId || '',
      navStyle: `padding-top:${statusBar}px;height:${navHeight}px;padding-right:${right}px`
    });
  },

  onShow() { if (this.data.id) this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    const [projectRes, taskRes, groupRes] = await Promise.all([
      projectService.get(this.data.id),
      taskService.listByProject(this.data.id),
      groupService.list(this.data.id)
    ]);
    if (!projectRes.success || !taskRes.success || !groupRes.success) {
      const message = projectRes.message || taskRes.message || groupRes.message || '详情加载失败';
      console.error('[project-detail] load failed:', { projectRes, taskRes, groupRes });
      this.setData({ loading: false, error: message });
      return;
    }
    const rawProject = projectRes.data.project;
    const project = this.decorateProject(rawProject, taskRes.data.tasks || []);
    const tasks = this.sortTasks((taskRes.data.tasks || []).map(item => this.decorateTask(item)));
    const targetTask = this.data.targetTaskId ? tasks.find(task => task._id === this.data.targetTaskId) : null;
    this.setData({
      project, tasks, groups: groupRes.data.groups || [], loading: false, error: '',
      ...(targetTask ? { groupId: targetTask.groupKey || '', priority: targetTask.priority || 'all' } : {})
    });
    this.refreshDerivedData();
    if (this.data.targetTaskId && !targetTask) wx.showToast({ title: '分支任务不存在或已删除', icon: 'none' });
  },

  decorateProject(project, tasks) {
    const validTasks = tasks.filter(item => item.status !== 'cancelled');
    const completedTaskCount = validTasks.filter(item => item.status === 'completed').length;
    const taskCount = validTasks.length;
    const progress = taskCount ? Math.round(completedTaskCount * 100 / taskCount) : 0;
    const nearest = validTasks
      .filter(item => item.status !== 'completed' && item.status !== 'approved' && item.status !== 'closed_by_parent' && getEffectiveDueAt(item))
      .sort((a, b) => getEffectiveDueAt(a) - getEffectiveDueAt(b))[0];
    const iconView = projectIconView(project, (project.title || '事').slice(0, 1));
    return {
      ...project,
      ...iconView,
      progressCache: progress,
      completedTaskCountCache: completedTaskCount,
      taskCountCache: taskCount,
      allBranchesCompleted: taskCount > 0 && completedTaskCount === taskCount,
      timeText: format.projectTimeText(project),
      statusText: format.statusLabel(project.status),
      nearestTaskText: project.status === 'completed'
        ? `已结束 · 已完成 ${completedTaskCount}/${taskCount}`
        : nearest ? `最近截止：${nearest.title}` : (validTasks.length ? '暂无临近任务' : '还没有分支任务')
    };
  },

  decorateTask(task) {
    const isCompleted = task.status === 'completed';
    return {
      ...task,
      groupKey: task.groupId || '',
      isCompleted,
      priorityText: format.priorityLabel(task.priority),
      timeText: taskTimeText(task),
      completedText: task.completedAt ? completedTimeText(task.completedAt) : '',
      overdue: isTaskOverdue(task)
    };
  },

  sortTasks(tasks) {
    return tasks.slice().sort((a, b) => {
      if (a.groupKey === b.groupKey) return Number(a.isCompleted) - Number(b.isCompleted) || (a.sortOrder || 0) - (b.sortOrder || 0);
      return 0;
    });
  },

  refreshDerivedData() {
    const tasks = this.data.tasks;
    const nearest = tasks
      .filter(item => !item.isCompleted && item.status !== 'closed_by_parent' && (item.dueAt || item.endAt))
      .sort((a, b) => new Date(a.dueAt || a.endAt) - new Date(b.dueAt || b.endAt))[0];
    const groupTabs = [
      { value: 'all', label: '全部', count: tasks.length },
      ...this.data.groups.map(group => ({ value: group._id, label: group.name, count: tasks.filter(task => task.groupKey === group._id).length })),
      { value: '', label: '未分组', count: tasks.filter(task => !task.groupKey).length }
    ];
    const filteredTasks = tasks.filter(item => {
      const groupMatch = this.data.groupId === 'all' || item.groupKey === this.data.groupId;
      const priorityMatch = this.data.priority === 'all' || item.priority === this.data.priority;
      return groupMatch && priorityMatch;
    });
    this.setData({
      groupTabs,
      filteredTasks,
      hasActiveFilter: this.data.groupId !== 'all' || this.data.priority !== 'all',
      project: this.data.project ? {
        ...this.data.project,
        nearestTaskText: this.data.project.status === 'completed'
          ? `已结束 · 已完成 ${this.data.project.completedTaskCountCache || 0}/${this.data.project.taskCountCache || 0}`
          : nearest ? `最近截止：${nearest.title}` : (tasks.length ? '暂无临近任务' : '还没有分支任务')
      } : null
    });
  },

  selectGroup(e) { this.setData({ groupId: e.detail.value }, () => this.refreshDerivedData()); },
  selectPriority(e) { this.setData({ priority: e.detail.value }, () => this.refreshDerivedData()); },
  clearFilters() { this.setData({ groupId: 'all', priority: 'all' }, () => this.refreshDerivedData()); },
  add() { wx.navigateTo({ url: `/pages/task-edit/task-edit?projectId=${this.data.id}` }); },
  back() { wx.navigateBack({ delta: 1 }); },
  edit() { wx.navigateTo({ url: `/pages/project-edit/project-edit?id=${this.data.id}` }); },
  manageGroups() { wx.navigateTo({ url: `/pages/group-manage/group-manage?projectId=${this.data.id}` }); },
  editTask(e) { const task = e.detail ? e.detail.item : e.currentTarget.dataset.item; wx.navigateTo({ url: `/pages/task-edit/task-edit?projectId=${this.data.id}&id=${task._id}` }); },

  async showProjectMenu() {
    const project = this.data.project;
    const actions = [
      { label: '编辑备忘录', run: () => this.edit() }
    ];
    if (project && project.status === 'active') {
      actions.push({ label: '结束备忘录', run: () => this.completeProject() });
    }
    if (project && (project.status === 'completed' || (project.status === 'archived' && project.completedAt))) {
      actions.push({ label: '重新打开', run: () => this.reopenProject() });
    }
    if (project && project.status !== 'archived') {
      actions.push({ label: '归档备忘录', run: () => this.archiveProject() });
    }
    actions.push({ label: '删除备忘录', run: () => this.deleteProject() });
    const result = await actionSheet(actions.map(item => item.label));
    if (result < 0) return;
    return actions[result].run();
  },

  async completeProject() {
    const project = this.data.project;
    const taskRes = await taskService.listByProject(this.data.id);
    const allTasks = taskRes.success ? (taskRes.data.tasks || []) : [];
    const incompleteTasks = allTasks.filter(item => item.status === 'todo' || item.status === 'doing');
    const incompleteCount = incompleteTasks.length;
    const totalTaskCount = allTasks.length;

    let title = '结束备忘录';
    let content = '确认结束此备忘录？';
    let confirmColor = '#FF6B35';

    if (incompleteCount > 0) {
      title = '提前结束备忘录';
      content = `当前还有 ${incompleteCount} 个未完成的分支任务。结束后，它们会显示为「随备忘录结束」，不会算作已完成。`;
      confirmColor = '#F04A4A';
    } else if (totalTaskCount === 0) {
      content = '该备忘录还没有分支任务，确认直接结束？';
    }

    const confirmed = await confirmModal(title, content, confirmColor);
    if (!confirmed) return;

    const res = await projectService.complete(this.data.id, incompleteCount > 0);
    wx.showToast({ title: res.success ? '备忘录已结束并归档' : (res.message || '操作失败，请稍后重试'), icon: 'none' });
    if (res.success) setTimeout(() => wx.navigateBack(), 500);
  },

  async reopenProject() {
    const confirmed = await confirmModal('重新打开备忘录', '重新打开后，因备忘录结束而关闭的分支任务将恢复。确定继续吗？');
    if (!confirmed) return;
    const res = await projectService.reopen(this.data.id);
    wx.showToast({ title: res.success ? '备忘录已重新打开' : (res.message || '操作失败，请稍后重试'), icon: 'none' });
    if (res.success) this.load();
  },

  async archiveProject() {
    const confirmed = await confirmModal('归档备忘录', '归档后可在「我的」→「已归档备忘录」中恢复。');
    if (!confirmed) return;
    const res = await projectService.archive(this.data.id);
    wx.showToast({ title: res.success ? '已归档' : (res.message || '操作失败，请稍后重试'), icon: res.success ? 'success' : 'none' });
    if (res.success) setTimeout(() => wx.navigateBack(), 500);
  },

  async deleteProject() {
    const confirmed = await confirmModal('删除备忘录', `确定将该备忘录移入回收站吗？`, '#F04A4A');
    if (!confirmed) return;
    const res = await projectService.softDelete(this.data.id);
    wx.showToast({ title: res.success ? '已移入回收站' : (res.message || '操作失败，请稍后重试'), icon: res.success ? 'success' : 'none' });
    if (res.success) setTimeout(() => wx.navigateBack(), 500);
  },

  async toggleTask(e) {
    const task = e.detail.item;
    if (this.data.operatingTaskId || task.status === 'closed_by_parent') return;
    this.setData({ operatingTaskId: task._id });
    const res = task.isCompleted ? await taskService.reopen(task._id) : await taskService.complete(task._id);
    this.setData({ operatingTaskId: '' });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    const now = new Date().toISOString();
    const tasks = this.data.tasks.map(item => item._id === task._id ? this.decorateTask({
      ...item,
      status: task.isCompleted ? 'todo' : 'completed',
      completedAt: task.isCompleted ? null : now
    }) : item);
    this.setData({ tasks: this.sortTasks(tasks) });
    this.applyProgress(res.data && res.data.progress);
    this.refreshDerivedData();
  },

  async showTaskMenu(e) {
    const task = e.detail.item;
    const result = await actionSheet(['编辑', '上移', '下移', '删除']);
    if (result < 0) return;
    if (result === 0) return this.editTask({ detail: { item: task } });
    if (result === 1) return this.moveTask(task, -1);
    if (result === 2) return this.moveTask(task, 1);
    return this.deleteTask(task);
  },

  async deleteTask(task) {
    const confirmed = await confirmModal('删除分支任务', `确定将该分支任务移入回收站吗？`, '#F04A4A');
    if (!confirmed) return;
    const res = await taskService.softDelete(task._id);
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ tasks: this.data.tasks.filter(item => item._id !== task._id) });
    this.applyProgress(res.data && res.data.progress);
    this.refreshDerivedData();
    wx.showToast({ title: res.message, icon: 'success' });
  },

  async moveTask(task, direction) {
    if (this.data.sorting) return;
    const groupTasks = this.data.tasks.filter(item => item.groupKey === task.groupKey).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const index = groupTasks.findIndex(item => item._id === task._id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groupTasks.length) return wx.showToast({ title: direction < 0 ? '已经是第一项' : '已经是最后一项', icon: 'none' });
    [groupTasks[index], groupTasks[target]] = [groupTasks[target], groupTasks[index]];
    this.setData({ sorting: true });
    const res = await taskService.reorder(this.data.id, groupTasks.map(item => item._id));
    this.setData({ sorting: false });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    const orders = new Map(groupTasks.map((item, orderIndex) => [item._id, (orderIndex + 1) * 1000]));
    this.setData({ tasks: this.sortTasks(this.data.tasks.map(item => orders.has(item._id) ? { ...item, sortOrder: orders.get(item._id) } : item)) });
    this.refreshDerivedData();
  },

  applyProgress(progress) {
    if (!progress || !this.data.project) return;
    this.setData({ project: {
      ...this.data.project,
      taskCountCache: progress.taskCount,
      completedTaskCountCache: progress.completedTaskCount,
      progressCache: Math.max(0, Math.min(100, Number(progress.progress) || 0)),
      allBranchesCompleted: progress.allBranchesCompleted === true
    }});
  },

  retry() { this.load(); }
});

function taskTimeText(task) {
  if (task.scheduleType === 'none') return '未设置时间';
  if (task.scheduleType === 'deadline') return `截止 ${compactDateTime(getEffectiveDueAt(task))}`;
  if (task.scheduleType === 'range') return `${compactDateTime(task.startAt)}—${compactDateTime(getEffectiveDueAt(task))}`;
  return '未设置时间';
}

function compactDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待确认';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function completedTimeText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const pad = number => String(number).padStart(2, '0');
  return `${sameDay ? '今天' : `${date.getMonth() + 1}月${date.getDate()}日`}${pad(date.getHours())}:${pad(date.getMinutes())}完成`;
}

function actionSheet(itemList) {
  return new Promise(resolve => wx.showActionSheet({ itemList, success: result => resolve(result.tapIndex), fail: () => resolve(-1) }));
}

function confirmModal(title, content, confirmColor = '#FF6B35') {
  return new Promise(resolve => wx.showModal({ title, content, confirmColor, success: result => resolve(!!result.confirm), fail: () => resolve(false) }));
}
