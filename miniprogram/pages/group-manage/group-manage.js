const service = require('../../services/group-service');
const COLORS = ['#FF6B35', '#F04A4A', '#F6B90A', '#22B573', '#4E8DF5'];
const ICONS = ['folder', 'flag', 'bookmark', 'circle'];
Page({
  data: { projectId: '', groups: [], loading: true, error: '', operating: false },
  onLoad(query) { this.setData({ projectId: query.projectId || '' }); },
  onShow() { if (this.data.projectId) this.load(); },
  async load() { this.setData({ loading: true, error: '' }); const res = await service.list(this.data.projectId); this.setData({ groups: res.success ? res.data.groups : [], loading: false, error: res.success ? '' : res.message }); },
  retry() { this.load(); },
  async editDialog(group) { const result = await new Promise(resolve => wx.showModal({ title: group ? '编辑分组' : '新建分组', editable: true, placeholderText: '分组名称（最多20字）', content: group ? group.name : '', success: resolve })); if (!result.confirm || !result.content.trim()) return; const colorIndex = await chooseOption('选择分组颜色', ['橙色', '红色', '黄色', '绿色', '蓝色']); if (colorIndex < 0) return; const iconIndex = await chooseOption('选择分组图标', ['文件夹', '旗帜', '书签', '圆点']); if (iconIndex < 0) return; const data = { projectId: this.data.projectId, name: result.content.trim(), color: COLORS[colorIndex], icon: ICONS[iconIndex] }; const res = group ? await service.update(group._id, data) : await service.create(data); wx.showToast({ title: res.message || (res.success ? '已保存' : '操作失败'), icon: res.success ? 'success' : 'none' }); if (res.success) this.load(); },
  createGroup() { this.editDialog(null); },
  editGroup(e) { this.editDialog(e.currentTarget.dataset.item); },
  async deleteGroup(e) { const group = e.currentTarget.dataset.item; const confirm = await new Promise(resolve => wx.showModal({ title: '删除分组', content: `删除“${group.name}”后，组内任务会移至未分组。`, confirmColor: '#F04A4A', success: resolve })); if (!confirm.confirm) return; const res = await service.remove(group._id); wx.showToast({ title: res.message, icon: res.success ? 'success' : 'none' }); if (res.success) this.load(); },
  async move(e) { if (this.data.operating) return; const index = Number(e.currentTarget.dataset.index), direction = Number(e.currentTarget.dataset.direction), target = index + direction; if (target < 0 || target >= this.data.groups.length) return; const groups = this.data.groups.slice(); [groups[index], groups[target]] = [groups[target], groups[index]]; this.setData({ groups, operating: true }); const res = await service.reorder(this.data.projectId, groups.map(item => item._id)); this.setData({ operating: false }); if (!res.success) { wx.showToast({ title: res.message, icon: 'none' }); this.load(); }
  }
});
function chooseOption(title, itemList) { return new Promise(resolve => wx.showActionSheet({ alertText: title, itemList, success: result => resolve(result.tapIndex), fail: () => resolve(-1) })); }
