const groupService = require('../../services/group-service');
const taskService = require('../../services/task-service');
const COLORS = ['#FF6B35', '#F04A4A', '#F6B90A', '#22B573', '#4E8DF5'];
const ICONS = ['folder', 'flag', 'bookmark', 'circle'];

Page({
  data: { projectId: '', groups: [], loading: true, error: '', operating: false, editing: false, sortingMode: false, navStyle: '' },
  onLoad(query) {
    const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBar = system.statusBarHeight || 20;
    const navHeight = menu ? (menu.top - statusBar) * 2 + menu.height : 44;
    const right = menu ? Math.max(96, system.windowWidth - menu.left + 8) : 16;
    this.setData({ projectId: query.projectId || '', navStyle: `padding-top:${statusBar}px;height:${navHeight}px;padding-right:${right}px` });
  },
  onShow() { if (this.data.projectId) this.load(); },
  back() { wx.navigateBack(); },
  toggleSorting() { this.setData({ sortingMode: !this.data.sortingMode }); },
  async load() {
    this.setData({ loading: true, error: '' });
    const [groupRes, taskRes] = await Promise.all([groupService.list(this.data.projectId), taskService.listByProject(this.data.projectId)]);
    if (!groupRes.success || !taskRes.success) {
      console.error('[group-manage] load failed:', { groupRes, taskRes });
      return this.setData({ loading: false, error: groupRes.message || taskRes.message || '分组加载失败' });
    }
    const tasks = taskRes.data.tasks || [];
    const groups = (groupRes.data.groups || []).map(group => ({ ...group, taskCount: tasks.filter(task => task.groupId === group._id).length }));
    this.setData({ groups, loading: false, error: '' });
  },
  retry() { this.load(); },
  async editDialog(group) {
    if (this.data.editing) return;
    this.setData({ editing: true });
    const result = await editableModal(group ? '编辑分组' : '新建分组', group ? group.name : '');
    if (!result.confirm || !result.content.trim()) return this.setData({ editing: false });
    const name = result.content.trim();
    if (name.length > 20) { this.setData({ editing: false }); return wx.showToast({ title: '分组名称不能超过20字', icon: 'none' }); }
    const colorIndex = await chooseOption('选择分组颜色', ['橙色', '红色', '黄色', '绿色', '蓝色']);
    if (colorIndex < 0) return this.setData({ editing: false });
    const iconIndex = await chooseOption('选择分组图标', ['文件夹', '旗帜', '书签', '圆点']);
    if (iconIndex < 0) return this.setData({ editing: false });
    const data = { projectId: this.data.projectId, name, color: COLORS[colorIndex], icon: ICONS[iconIndex] };
    const res = group ? await groupService.update(group._id, data) : await groupService.create(data);
    this.setData({ editing: false });
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    wx.showToast({ title: res.message || '已保存', icon: 'success' });
    this.load();
  },
  createGroup() { this.editDialog(null); },
  async showMenu(e) {
    const group = e.currentTarget.dataset.item;
    const index = await chooseOption('分组操作', ['编辑分组', '删除分组']);
    if (index === 0) this.editDialog(group);
    if (index === 1) this.deleteGroup(group);
  },
  async deleteGroup(group) {
    const confirmed = await confirmDelete(group.name);
    if (!confirmed) return;
    const res = await groupService.remove(group._id);
    if (!res.success) return wx.showToast({ title: res.message, icon: 'none' });
    this.setData({ groups: this.data.groups.filter(item => item._id !== group._id) });
    wx.showToast({ title: res.message, icon: 'success' });
  },
  async move(e) {
    if (this.data.operating) return;
    const index = Number(e.currentTarget.dataset.index);
    const direction = Number(e.currentTarget.dataset.direction);
    const target = index + direction;
    if (target < 0 || target >= this.data.groups.length) return;
    const groups = this.data.groups.slice();
    [groups[index], groups[target]] = [groups[target], groups[index]];
    this.setData({ groups, operating: true });
    const res = await groupService.reorder(this.data.projectId, groups.map(item => item._id));
    this.setData({ operating: false });
    if (!res.success) { wx.showToast({ title: res.message, icon: 'none' }); this.load(); }
  }
});

function editableModal(title, content) { return new Promise(resolve => wx.showModal({ title, editable: true, placeholderText: '分组名称（1—20字）', content, success: resolve, fail: () => resolve({ confirm: false }) })); }
function chooseOption(title, itemList) { return new Promise(resolve => wx.showActionSheet({ alertText: title, itemList, success: result => resolve(result.tapIndex), fail: () => resolve(-1) })); }
function confirmDelete(name) { return new Promise(resolve => wx.showModal({ title: '删除分组', content: `删除“${name}”不会删除其中任务，这些任务会进入“未分组”。`, confirmColor: '#F04A4A', success: result => resolve(!!result.confirm), fail: () => resolve(false) })); }
