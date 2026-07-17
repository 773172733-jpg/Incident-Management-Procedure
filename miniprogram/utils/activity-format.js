/**
 * 事件树 - 操作记录格式化工具
 */
var ACTION_META = {
  'project.created':     { icon: 'plus',     tone: 'info',    label: '\u521b\u5efa\u4e86\u4e8b\u4ef6' },
  'project.updated':     { icon: 'edit',     tone: 'primary', label: '\u4fee\u6539\u4e86\u4e8b\u4ef6' },
  'project.archived':    { icon: 'archive',  tone: 'gray',    label: '\u5f52\u6863\u4e86\u4e8b\u4ef6' },
  'project.restored':    { icon: 'restore',  tone: 'teal',    label: '\u6062\u590d\u4e86\u4e8b\u4ef6' },
  'project.deleted':     { icon: 'trash',    tone: 'danger',  label: '\u5220\u9664\u4e86\u4e8b\u4ef6' },
  'project.completed':   { icon: 'check',    tone: 'success', label: '\u7ed3\u675f\u4e86\u4e8b\u4ef6' },
  'project.completed_early': { icon: 'stop', tone: 'orange',  label: '\u63d0\u524d\u7ed3\u675f\u4e86\u4e8b\u4ef6' },
  'project.reopened':    { icon: 'undo',     tone: 'info',    label: '\u91cd\u65b0\u6253\u5f00\u4e86\u4e8b\u4ef6' },
  'task.created':        { icon: 'plus',     tone: 'info',    label: '\u521b\u5efa\u4e86\u4efb\u52a1' },
  'task.updated':        { icon: 'edit',     tone: 'primary', label: '\u4fee\u6539\u4e86\u4efb\u52a1' },
  'task.completed':      { icon: 'check',    tone: 'success', label: '\u5b8c\u6210\u4e86\u4efb\u52a1' },
  'task.reopened':       { icon: 'undo',     tone: 'info',    label: '\u91cd\u65b0\u6253\u5f00\u4e86\u4efb\u52a1' },
  'task.deleted':        { icon: 'trash',    tone: 'danger',  label: '\u5220\u9664\u4e86\u4efb\u52a1' },
  'task.restored':       { icon: 'restore',  tone: 'teal',    label: '\u6062\u590d\u4e86\u4efb\u52a1' },
  'task.reordered':      { icon: 'sort',     tone: 'slate',   label: '\u8c03\u6574\u4e86\u4efb\u52a1\u987a\u5e8f' },
  'task.closed_by_parent': { icon: 'ban',    tone: 'gray',    label: '\u968f\u4e8b\u4ef6\u7ed3\u675f' },
  'group.created':       { icon: 'plus',     tone: 'info',    label: '\u521b\u5efa\u4e86\u5206\u7ec4' },
  'group.updated':       { icon: 'edit',     tone: 'primary', label: '\u4fee\u6539\u4e86\u5206\u7ec4' },
  'group.deleted':       { icon: 'trash',    tone: 'danger',  label: '\u5220\u9664\u4e86\u5206\u7ec4' },
  'group.reordered':     { icon: 'sort',     tone: 'slate',   label: '\u8c03\u6574\u4e86\u5206\u7ec4\u987a\u5e8f' },
  'user_registered':     { icon: 'plus',     tone: 'info',    label: '\u52a0\u5165\u4e86\u4e8b\u4ef6\u6811' },
  'user.created':        { icon: 'plus',     tone: 'info',    label: '\u52a0\u5165\u4e86\u4e8b\u4ef6\u6811' }
};
function getMeta(a) { return ACTION_META[a] || { icon: 'circle', tone: 'gray', label: '\u6267\u884c\u4e86\u4e00\u9879\u64cd\u4f5c' }; }
function localDateKey(ca) {
  if (!ca) return '';
  var d = new Date(ca);
  if (isNaN(d.getTime())) return '';
  var p = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function formatDateLabel(ca, now) {
  if (!ca) return '';
  var d = new Date(ca);
  if (isNaN(d.getTime())) return '';
  var current = now ? new Date(now) : new Date();
  if (isNaN(current.getTime())) current = new Date();
  var todayKey = localDateKey(current);
  var yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  var key = localDateKey(d);
  if (key === todayKey) return '\u4eca\u5929';
  if (key === localDateKey(yesterday)) return '\u6628\u5929';
  var weekdays = ['\u5468\u65e5','\u5468\u4e00','\u5468\u4e8c','\u5468\u4e09','\u5468\u56db','\u5468\u4e94','\u5468\u516d'];
  return (d.getMonth() + 1) + '\u6708' + d.getDate() + '\u65e5 ' + weekdays[d.getDay()];
}
function mergeUniqueLogs(existing, incoming) {
  var map = {};
  (existing || []).concat(incoming || []).forEach(function(item) {
    var id = item && (item.id || item._id);
    if (id) map[id] = item;
  });
  return Object.keys(map).map(function(id) { return map[id]; }).sort(function(left, right) {
    var lt = new Date(left.createdAt).getTime();
    var rt = new Date(right.createdAt).getTime();
    if (!Number.isFinite(lt)) lt = -Infinity;
    if (!Number.isFinite(rt)) rt = -Infinity;
    return rt - lt || String(left.id || left._id).localeCompare(String(right.id || right._id));
  });
}
function groupLogsByDay(logs, now) {
  var groups = [];
  var map = {};
  mergeUniqueLogs([], logs).forEach(function(log) {
    var key = localDateKey(log.createdAt);
    if (!key) return;
    if (!map[key]) {
      map[key] = {
        key: key,
        label: formatDateLabel(log.createdAt, now),
        count: 0,
        items: []
      };
      groups.push(map[key]);
    }
    map[key].items.push(log);
    map[key].count += 1;
  });
  return groups;
}
function resolveExpandedDateKey(groups, currentKey, reset) {
  if (!groups || !groups.length) return '';
  if (reset) return groups[0].key;
  if (!currentKey) return '';
  return groups.some(function(group) { return group.key === currentKey; }) ? currentKey : groups[0].key;
}
function formatTimeText(ca) {
  if (!ca) return ''; var d=new Date(ca); if(isNaN(d.getTime()))return '';
  var p=function(n){return String(n).padStart(2,'0');};
  return p(d.getHours())+':'+p(d.getMinutes());
}
function formatChanges(b,a) {
  if(!b||!a)return'';
  var c=[];
  if(b.title!==undefined&&a.title!==undefined&&b.title!==a.title)c.push('\u540d\u79f0\uff1a'+(b.title||'\u672a\u547d\u540d')+' \u2192 '+(a.title||'\u672a\u547d\u540d'));
  if(b.status!==undefined&&a.status!==undefined&&b.status!==a.status){var sm={'active':'\u8fdb\u884c\u4e2d','completed':'\u5df2\u7ed3\u675f','archived':'\u5df2\u5f52\u6863','cancelled':'\u5df2\u53d6\u6d88'};c.push('\u72b6\u6001\uff1a'+(sm[b.status]||b.status)+' \u2192 '+(sm[a.status]||a.status));}
  if(b.startAt!==a.startAt){var s1=b.startAt?fsd(b.startAt):'\u672a\u8bbe\u7f6e',s2=a.startAt?fsd(a.startAt):'\u672a\u8bbe\u7f6e';if(s1!==s2)c.push('\u5f00\u59cb\u65f6\u95f4\uff1a'+s1+' \u2192 '+s2);}
  if(b.endAt!==a.endAt){var e1=b.endAt?fsd(b.endAt):'\u672a\u8bbe\u7f6e',e2=a.endAt?fsd(a.endAt):'\u672a\u8bbe\u7f6e';if(e1!==e2)c.push('\u7ed3\u675f\u65f6\u95f4\uff1a'+e1+' \u2192 '+e2);}
  if(b.dueAt!==a.dueAt){var d1=b.dueAt?fsd(b.dueAt):'\u672a\u8bbe\u7f6e',d2=a.dueAt?fsd(a.dueAt):'\u672a\u8bbe\u7f6e';if(d1!==d2)c.push('\u622a\u6b62\u65f6\u95f4\uff1a'+d1+' \u2192 '+d2);}
  if(b.name!==undefined&&a.name!==undefined&&b.name!==a.name)c.push('\u540d\u79f0\uff1a'+(b.name||'')+' \u2192 '+(a.name||''));
  return c.slice(0,3).join('\\n');
  function fsd(v){if(!v)return'\u672a\u8bbe\u7f6e';var d=new Date(v);if(isNaN(d.getTime()))return String(v).substring(0,10);return(d.getMonth()+1)+'\u6708'+d.getDate()+'\u65e5';}
}
module.exports={
  getMeta,
  localDateKey,
  formatDateLabel,
  formatTimeText,
  formatChanges,
  mergeUniqueLogs,
  groupLogsByDay,
  resolveExpandedDateKey
};
