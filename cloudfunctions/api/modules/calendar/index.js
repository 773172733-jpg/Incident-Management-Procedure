const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const auth = require('../../common/auth');
const { success, fail } = require('../../common/response');

function ldk(d) {
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+dd;
}
function tt(task){
  if(task.scheduleType==='deadline'&&task.dueAt){var d=new Date(task.dueAt);if(isNaN(d.getTime()))return '';var p=function(n){return String(n).padStart(2,'0');};return '\u622a\u6b62 '+(d.getMonth()+1)+'\u6708'+d.getDate()+'\u65e5 '+p(d.getHours())+':'+p(d.getMinutes());}
  if(task.scheduleType==='range'){var s=task.startAt?new Date(task.startAt):null;var e=task.endAt||task.dueAt;var ed=e?new Date(e):null;if(s&&ed&&!isNaN(s.getTime())&&!isNaN(ed.getTime()))return (s.getMonth()+1)+'\u6708'+s.getDate()+'\u65e5\u2014'+(ed.getMonth()+1)+'\u6708'+ed.getDate()+'\u65e5';}
  return '';
}

async function month(payload, context) {
  var openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED','\u65e0\u6cd5\u83b7\u53d6\u7528\u6237\u8eab\u4efd');
  var year = Number(payload.year), month = Number(payload.month);
  if (!year||year<2000||year>2100||!month||month<1||month>12) return fail('INVALID_PARAMS','\u5e74\u4efd\u6216\u6708\u4efd\u65e0\u6548');
  var mi=month-1, ms=new Date(year,mi,1), me=new Date(year,mi+1,0,23,59,59,999);
  try {
    var pr=await db.collection('projects').where({ownerId:openid,deletedAt:_.eq(null)}).field({_id:true,title:true}).get();
    var pm={},pi=[]; for(var i=0;i<(pr.data||[]).length;i++){var p=pr.data[i];pm[p._id]=p.title||'';pi.push(p._id);}
    if(pi.length===0) return success({year,month,days:{},tasks:[]});
    var dl=[]; try{var dr=await db.collection('tasks').where({projectId:_.in(pi),deletedAt:_.eq(null),scheduleType:'deadline',dueAt:_.gte(ms)}).get();dl=dr.data||[];}catch(e){}
    var rn=[]; try{var rr=await db.collection('tasks').where({projectId:_.in(pi),deletedAt:_.eq(null),scheduleType:'range',startAt:_.lte(me)}).get();for(var j=0;j<(rr.data||[]).length;j++){var t=rr.data[j];var te=t.endAt||t.dueAt;if(te&&new Date(te)>=ms)rn.push(t);}}catch(e){}
    var tm={};for(var k=0;k<dl.length;k++)tm[dl[k]._id]=dl[k];for(var l=0;l<rn.length;l++)tm[rn[l]._id]=rn[l];
    var all=[];for(var id in tm)all.push(tm[id]);
    var days={},dec=[];
    var priMap={core:'\u6838\u5fc3',important:'\u91cd\u8981',optional:'\u53ef\u9009'};
    var staMap={todo:'\u672a\u5b8c\u6210',doing:'\u8fdb\u884c\u4e2d',completed:'\u5df2\u5b8c\u6210',closed_by_parent:'\u968f\u4e8b\u4ef6\u7ed3\u675f'};
    for(var m2=0;m2<all.length;m2++){
      var task=all[m2],st=task.startAt?new Date(task.startAt):null,et=null;
      if(task.scheduleType==='deadline'&&task.dueAt) et=new Date(task.dueAt);
      if(task.scheduleType==='range'&&task.endAt) et=new Date(task.endAt);
      else if(task.scheduleType==='range'&&task.dueAt) et=new Date(task.dueAt);
      var keys=[];
      if(task.scheduleType==='deadline'&&et){var dk=ldk(et);if(et>=ms&&et<=me)keys.push(dk);}
      else if(task.scheduleType==='range'&&st&&et){var rs=st>ms?st:ms,re=et<me?et:me,c=new Date(rs);while(c<=re){keys.push(ldk(c));c.setDate(c.getDate()+1);}}
      for(var n=0;n<keys.length;n++){var kk=keys[n];if(!days[kk])days[kk]={total:0,completed:0,todo:0,closedByParent:0};days[kk].total++;var ic=task.status==='completed'||task.status==='approved';if(ic)days[kk].completed++;else if(task.status==='closed_by_parent')days[kk].closedByParent++;else days[kk].todo++;}
      var isC=task.status==='completed'||task.status==='approved',tg=task.dueAt||task.endAt;
      dec.push({_id:task._id,projectId:task.projectId,projectTitle:pm[task.projectId]||'',title:task.title||'',priority:task.priority||'optional',priorityText:priMap[task.priority]||'',status:task.status||'todo',statusText:staMap[task.status]||'\u672a\u5b8c\u6210',scheduleType:task.scheduleType||'none',startAt:task.startAt||null,endAt:task.endAt||null,dueAt:task.dueAt||null,completedAt:task.completedAt||null,isCompleted:isC,isClosedByParent:task.status==='closed_by_parent',overdue:!isC&&task.status!=='closed_by_parent'&&tg&&new Date(tg).getTime()<Date.now(),timeText:tt(task),dateKeys:keys});
    }
    return success({year,month,days,tasks:dec});
  } catch(err){console.error('[calendar.month]',err);return fail('INTERNAL_ERROR','\u65e5\u5386\u67e5\u8be2\u5931\u8d25');}
}
async function day(payload,context){return fail('NOT_IMPLEMENTED','\u8bf7\u4f7f\u7528calendar.month');}
module.exports={month,day};