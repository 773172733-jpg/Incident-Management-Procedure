const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const auth = require('../../common/auth');
const permission = require('../../common/permission');
const { success, fail } = require('../../common/response');
const { validateProjectTitle, validateTimeMode, validateObjectId } = require('../../common/validator');
const { TIME_MODE, PROJECT_STATUS, TASK_STATUS } = require('../../common/constants');
const { normalizeProjectIcon } = require('../../common/project-icon');
const { writeActivityLog } = require('../../common/logger');
const {
  recalculateProjectProgress,
  loadProjectProgressStats
} = require('../../common/project-progress');
const { getAll } = require('../../common/query');
const { cancelTaskReminder, syncTaskReminder } = require('../../common/reminder');
const {
  isProjectInTrash,
  isEndedArchivedProject,
  isReopenableEndedProject,
  buildCompletionArchiveState,
  buildReopenedProjectState,
  statusBeforeParentClose,
  withProjectCompletionState
} = require('../../common/project-state');
const {
  CascadeDeleteError,
  clearOwnedTrash,
  emptyCounts,
  enforceProjectTrashLimit,
  purgeProjectData
} = require('../../common/trash-cleanup');

async function safelyCancelTaskReminder(task) {
  try { return await cancelTaskReminder(db, task.ownerId, task._id); }
  catch (error) {
    console.warn('[project] reminder cancel failed:', task._id, error.message);
    return { warning: '部分提醒暂未取消，请稍后重试' };
  }
}

async function safelySyncTaskReminder(task, project) {
  try { return await syncTaskReminder(db, task, project); }
  catch (error) {
    console.warn('[project] reminder sync failed:', task._id, error.message);
    return { warning: '部分小程序内提醒暂未恢复，请稍后重试' };
  }
}

async function syncActiveProjectTaskReminders(project) {
  const activeTasks = await getAll(db.collection('tasks').where({
    projectId: project._id,
    deletedAt: _.eq(null),
    status: _.in([TASK_STATUS.TODO, TASK_STATUS.DOING])
  }));
  const results = await Promise.all(activeTasks.map(task => (
    safelySyncTaskReminder(task, project)
  )));
  const warning = results.find(result => result && result.warning);
  return {
    syncedTaskCount: activeTasks.length,
    warning: warning ? warning.warning : ''
  };
}

function cleanProjectInput(payload) {
  const title = validateProjectTitle(payload.title);
  if (!title.valid) return { error: title.message };
  const timeMode = validateTimeMode(payload.timeMode || TIME_MODE.NONE);
  if (!timeMode.valid) return { error: timeMode.message };
  const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 1000) : '';
  const startAt = payload.startAt ? new Date(payload.startAt) : null;
  const endAt = payload.endAt ? new Date(payload.endAt) : null;
  const projectIcon = normalizeProjectIcon(payload.iconType, payload.iconValue);
  if (projectIcon.error) return { error: projectIcon.error };
  if (timeMode.value === TIME_MODE.RANGE && (!isValidDate(startAt) || !isValidDate(endAt) || endAt < startAt)) return { error: '请正确设置起止日期' };
  if (timeMode.value === TIME_MODE.ONGOING && !isValidDate(startAt)) return { error: '请设置开始日期' };
  return { data: {
    title: title.value, description, timeMode: timeMode.value,
    startAt: timeMode.value === TIME_MODE.NONE ? null : startAt,
    endAt: timeMode.value === TIME_MODE.RANGE ? endAt : null,
    icon: typeof payload.icon === 'string' ? payload.icon.slice(0, 24) : 'circle',
    themeColor: typeof payload.themeColor === 'string' ? payload.themeColor.slice(0, 16) : '#FF6B35',
    ...projectIcon.data
  }};
}
function isValidDate(value) { return value instanceof Date && !Number.isNaN(value.getTime()); }

async function getOwnedProject(projectId, openid) {
  const res = await db.collection('projects').doc(projectId).get().catch(() => ({ data: null }));
  const project = res.data;
  return project && permission.canReadProject(openid, project) ? project : null;
}

async function getProjectById(projectId) {
  const res = await db.collection('projects').where({ _id: projectId }).limit(1).get();
  return res.data && res.data[0] ? res.data[0] : null;
}

function progressSnapshot(project) {
  const current = withProjectCompletionState(project);
  return {
    taskCount: current.taskCountCache,
    completedTaskCount: current.completedTaskCountCache,
    progress: current.progressCache,
    allBranchesCompleted: current.allBranchesCompleted
  };
}

async function create(payload, context) {
  const openid = auth.getUserId(context); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const parsed = cleanProjectInput(payload); if (parsed.error) return fail('INVALID_PARAMS', parsed.error);
  const doc = {
    ...parsed.data, ownerId: openid, creatorId: openid, assigneeId: openid,
    teamId: null, sourceType: 'personal', visibility: 'private', approvalRequired: false,
    status: PROJECT_STATUS.ACTIVE, deletedAt: null, taskCountCache: 0,
    completedTaskCountCache: 0, progressCache: 0,
    completedAt: null, completedBy: null, completedEarly: false,
    createdAt: db.serverDate(), updatedAt: db.serverDate(), version: 1
  };
  const result = await db.collection('projects').add({ data: doc });
  await writeActivityLog({ projectId: result._id, operatorId: openid, action: 'project.created', targetType: 'project', targetId: result._id, targetTitleSnapshot: doc.title, after: parsed.data, visibleTo: [openid] });
  return success({ project: { ...doc, _id: result._id } }, '事件已创建');
}

async function get(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt) return fail('NOT_FOUND', '事件不存在或无权访问');
  return success({ project: withProjectCompletionState(project) });
}

async function list(payload, context) {
  const openid = auth.getUserId(context); if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const deletedMode = payload.deletedMode || 'active';
  const filter = { ownerId: openid };
  if (deletedMode === 'active') filter.deletedAt = _.eq(null);
  else if (deletedMode === 'deleted') filter.deletedAt = _.neq(null);
  if (payload.status) filter.status = payload.status;
  if (payload.timeMode) filter.timeMode = payload.timeMode;
  const page = Math.max(1, Number(payload.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(payload.pageSize) || 20));
  const skip = (page - 1) * pageSize;
  const query = db.collection('projects').where(filter).orderBy('updatedAt', 'desc');
  let projects;
  if (payload.excludeArchived === true) {
    const rows = await getAll(query);
    projects = rows
      .filter(project => project.status !== PROJECT_STATUS.ARCHIVED && project.status !== PROJECT_STATUS.CANCELLED)
      .slice(skip, skip + pageSize);
  } else {
    const res = await query.skip(skip).limit(pageSize).get();
    projects = res.data;
  }
  const decorated = payload.includeTaskStats === true
    ? await loadProjectProgressStats(db, openid, projects)
    : projects.map(withProjectCompletionState);
  return success({ projects: decorated });
}

async function listDeleted(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const rows = await getAll(db.collection('projects').where({
    ownerId: openid,
    deletedAt: _.neq(null)
  }).orderBy('updatedAt', 'desc'));
  return success({
    projects: rows
      .filter(project => project && project.deletedAt)
      .map(withProjectCompletionState)
  });
}

async function update(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt) return fail('NOT_FOUND', '事件不存在或无权修改');
  const parsed = cleanProjectInput({ ...project, ...payload }); if (parsed.error) return fail('INVALID_PARAMS', parsed.error);
  await db.collection('projects').doc(project._id).update({ data: { ...parsed.data, updatedAt: db.serverDate() } });
  await writeActivityLog({ projectId: project._id, operatorId: openid, action: 'project.updated', targetType: 'project', targetId: project._id, targetTitleSnapshot: parsed.data.title, before: { title: project.title, timeMode: project.timeMode }, after: parsed.data, visibleTo: [openid] });
  return success(null, '事件已更新');
}

async function archive(payload, context) { return changeStatus(payload, context, PROJECT_STATUS.ARCHIVED, 'project.archived', '事件已归档'); }
async function restoreFromArchive(payload, context) { return changeStatus(payload, context, PROJECT_STATUS.ACTIVE, 'project.restored', '事件已恢复'); }
async function changeStatus(payload, context, status, action, message) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt || !permission.canManageProject(openid, project)) return fail('NOT_FOUND', '事件不存在或无权操作');
  const statusData = { status, updatedAt: db.serverDate() };
  if (status === PROJECT_STATUS.ARCHIVED) statusData.archivedAt = db.serverDate();
  if (status === PROJECT_STATUS.ACTIVE && project.status === PROJECT_STATUS.ARCHIVED) statusData.archivedAt = null;
  await db.collection('projects').doc(project._id).update({ data: statusData });
  await writeActivityLog({ projectId: project._id, operatorId: openid, action, targetType: 'project', targetId: project._id, targetTitleSnapshot: project.title, before: { status: project.status }, after: { status }, visibleTo: [openid] });
  return success(null, message);
}

async function softDelete(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt) return fail('NOT_FOUND', '事件不存在或无权删除');
  await db.collection('projects').doc(project._id).update({ data: { deletedAt: db.serverDate(), updatedAt: db.serverDate() } });
  const tasks = await getAll(db.collection('tasks').where({ projectId: project._id, deletedAt: _.eq(null) })).catch(error => { console.warn('[project.softDelete] task reminder lookup failed:', error.message); return []; });
  await Promise.all(tasks.map(task => safelyCancelTaskReminder(task)));
  await writeActivityLog({ projectId: project._id, operatorId: openid, action: 'project.deleted', targetType: 'project', targetId: project._id, targetTitleSnapshot: project.title, visibleTo: [openid] });
  let retention = null;
  let retentionWarning = '';
  try {
    retention = await enforceProjectTrashLimit(db, openid, 100);
  } catch (error) {
    retentionWarning = '回收站自动清理暂未完成，将在下次删除时重试';
    console.error('[project.softDelete] retention cleanup failed:', JSON.stringify({
      collection: error.collection || '',
      message: error.message
    }));
  }
  return success({ retention, retentionWarning }, '事件已移入回收站');
}

async function restore(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || !project.deletedAt) return fail('NOT_FOUND', '回收站中未找到该事件');
  await db.collection('projects').doc(project._id).update({ data: { deletedAt: null, updatedAt: db.serverDate() } });
  const tasks = await getAll(db.collection('tasks').where({ projectId: project._id, deletedAt: _.eq(null) })).catch(error => { console.warn('[project.restore] task reminder lookup failed:', error.message); return []; });
  await Promise.all(tasks.map(task => safelySyncTaskReminder(task, { ...project, deletedAt: null })));
  await writeActivityLog({ projectId: project._id, operatorId: openid, action: 'project.restored', targetType: 'project', targetId: project._id, targetTitleSnapshot: project.title, visibleTo: [openid] });
  return success(null, '事件已恢复');
}

function purgeFailure(error, code, operation) {
  const collection = error instanceof CascadeDeleteError ? error.collection : '';
  console.error('[project.' + operation + '] failed:', JSON.stringify({
    collection,
    message: error && error.message
  }));
  const labelMap = {
    projects: '大事件',
    tasks: '分支任务',
    project_groups: '分组',
    reminders: '提醒',
    activity_logs: '动态记录'
  };
  const target = labelMap[collection] || '关联数据';
  return fail(code, operation === 'purge'
    ? '永久删除未完成（' + target + '），请稍后重试'
    : '清空回收站未完成（' + target + '），请稍后重试', {
    counts: error && error.counts ? error.counts : emptyCounts()
  });
}

async function purge(payload, context) {
  const openid = auth.getUserId(context);
  const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  if (!check.valid) return fail('INVALID_PARAMS', check.message);

  const project = await getProjectById(check.value);
  if (project && !permission.canManageProject(openid, project)) {
    return fail('NOT_FOUND', '大事件不存在或无权永久删除');
  }
  if (project && !isProjectInTrash(project)) {
    return fail('PROJECT_NOT_DELETED', '只能永久删除回收站中的大事件');
  }
  if (!project) {
    return success({
      counts: emptyCounts(),
      alreadyPurged: true
    }, '大事件已永久删除');
  }

  try {
    const counts = await purgeProjectData(db, {
      projectId: check.value,
      ownerId: openid,
      verifiedOwner: true
    });
    return success({
      counts,
      alreadyPurged: false
    }, '大事件已永久删除');
  } catch (error) {
    return purgeFailure(error, 'PURGE_FAILED', 'purge');
  }
}

async function clearTrash(payload, context) {
  const openid = auth.getUserId(context);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份');
  const counts = emptyCounts();

  try {
    Object.assign(counts, await clearOwnedTrash(db, openid));
    return success({ counts }, Object.values(counts).some(Boolean)
      ? '回收站已清空'
      : '回收站已经是空的');
  } catch (error) {
    return purgeFailure(error, 'TRASH_CLEAR_FAILED', 'clearTrash');
  }
}

async function complete(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt || !permission.canManageProject(openid, project)) return fail('NOT_FOUND', '事件不存在或无权操作');
  if (isEndedArchivedProject(project)) {
    return success({
      progress: progressSnapshot(project),
      alreadyCompleted: true
    }, '备忘录已结束并归档');
  }
  if (project.status === PROJECT_STATUS.COMPLETED) return fail('PROJECT_ALREADY_COMPLETED', '备忘录已结束');
  if (project.status === PROJECT_STATUS.ARCHIVED) return fail('INVALID_PARAMS', '已归档事件不能直接结束');
  if (project.status === PROJECT_STATUS.CANCELLED) return fail('INVALID_PARAMS', '已取消事件不能结束');
  if (project.status !== PROJECT_STATUS.ACTIVE) return fail('INVALID_PARAMS', '只有进行中的事件才能结束');

  const closureTasks = await getAll(db.collection('tasks').where({
    projectId: project._id, deletedAt: _.eq(null),
    status: _.in([TASK_STATUS.TODO, TASK_STATUS.DOING, TASK_STATUS.CLOSED_BY_PARENT])
  }));
  const incompleteTasks = closureTasks.filter(task => task.status !== TASK_STATUS.CLOSED_BY_PARENT);
  const previouslyClosedTasks = closureTasks.filter(task => task.status === TASK_STATUS.CLOSED_BY_PARENT);
  const hasIncomplete = closureTasks.length > 0;
  const confirmEarly = payload.confirmEarly === true;

  if (hasIncomplete && !confirmEarly && previouslyClosedTasks.length === 0) {
    return fail('HAS_INCOMPLETE_TASKS', '还有 ' + incompleteTasks.length + ' 个未完成任务，请确认是否提前结束');
  }

  const now = db.serverDate();
  const closedTasks = [];
  for (const task of incompleteTasks) {
    const changed = await db.collection('tasks').where({
      _id: task._id,
      projectId: project._id,
      status: task.status,
      deletedAt: _.eq(null)
    }).update({
      data: {
        status: TASK_STATUS.CLOSED_BY_PARENT,
        statusBeforeParentClose: task.status,
        closedAt: now,
        closedBy: openid,
        updatedAt: db.serverDate()
      }
    });
    if (changed.stats && changed.stats.updated) closedTasks.push(task);
  }
  const reminderResults = await Promise.all(
    closedTasks.concat(previouslyClosedTasks).map(task => safelyCancelTaskReminder(task))
  );
  const reminderWarning = reminderResults.find(result => result && result.warning);
  const progress = await recalculateProjectProgress(project._id);
  const action = hasIncomplete ? 'project.completed_early' : 'project.completed';
  const completed = await db.collection('projects').where({
    _id: project._id,
    ownerId: openid,
    status: PROJECT_STATUS.ACTIVE,
    deletedAt: _.eq(null)
  }).update({
    data: buildCompletionArchiveState(now, openid, hasIncomplete)
  });

  if (!completed.stats || !completed.stats.updated) {
    const latest = await getOwnedProject(project._id, openid);
    if (isEndedArchivedProject(latest)) {
      return success({ progress, alreadyCompleted: true }, '备忘录已结束并归档');
    }
    return fail('VERSION_CONFLICT', '备忘录状态已变化，请刷新后重试');
  }

  await writeActivityLog({
    projectId: project._id, operatorId: openid, action,
    targetType: 'project', targetId: project._id,
    targetTitleSnapshot: project.title,
    before: { status: project.status, completedEarly: false },
    after: {
      status: PROJECT_STATUS.ARCHIVED,
      completedEarly: hasIncomplete,
      archivedAt: 'serverDate'
    },
    metadata: {
      incompleteCount: hasIncomplete ? incompleteTasks.length : 0,
      resumedCloseCount: previouslyClosedTasks.length,
      autoArchived: true
    },
    visibleTo: [openid]
  }).catch(function(err) { console.warn('[project.complete] project log failed:', err.message); });

  return success({
    progress,
    autoArchived: true,
    reminderWarning: reminderWarning ? reminderWarning.warning : ''
  }, '备忘录已结束并归档');
}

async function reopen(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid);
  if (!project || project.deletedAt || !permission.canManageProject(openid, project)) return fail('NOT_FOUND', '事件不存在或无权操作');
  if (project.status === PROJECT_STATUS.ACTIVE && !project.completedAt) {
    const reminderResult = await syncActiveProjectTaskReminders(project);
    return success({
      progress: progressSnapshot(project),
      alreadyReopened: true,
      reminderWarning: reminderResult.warning
    }, '备忘录已重新打开');
  }
  if (project.status === PROJECT_STATUS.ARCHIVED && !project.completedAt) return fail('INVALID_PARAMS', '普通归档备忘录请使用恢复操作');
  if (project.status === PROJECT_STATUS.CANCELLED) return fail('INVALID_PARAMS', '已取消事件不能重新打开')
  if (!isReopenableEndedProject(project)) {
    return fail('INVALID_PARAMS', '只有已结束的备忘录才能重新打开');
  }

  const closedTasks = await getAll(db.collection('tasks').where({
    projectId: project._id, deletedAt: _.eq(null),
    status: TASK_STATUS.CLOSED_BY_PARENT
  }));

  const restoredTasks = [];
  for (const task of closedTasks) {
    const previousStatus = statusBeforeParentClose(task);
    const changed = await db.collection('tasks').where({
      _id: task._id,
      projectId: project._id,
      status: TASK_STATUS.CLOSED_BY_PARENT,
      deletedAt: _.eq(null)
    }).update({
      data: {
        status: previousStatus,
        statusBeforeParentClose: null,
        closedAt: null, closedBy: null,
        updatedAt: db.serverDate()
      }
    });
    if (changed.stats && changed.stats.updated) {
      restoredTasks.push({ ...task, status: previousStatus, statusBeforeParentClose: null });
    }
  }

  const reopened = await db.collection('projects').where({
    _id: project._id,
    ownerId: openid,
    status: project.status,
    deletedAt: _.eq(null)
  }).update({
    data: buildReopenedProjectState(db.serverDate())
  });

  if (!reopened.stats || !reopened.stats.updated) {
    const latest = await getOwnedProject(project._id, openid);
    if (!latest || latest.status !== PROJECT_STATUS.ACTIVE) {
      return fail('VERSION_CONFLICT', '备忘录状态已变化，请刷新后重试');
    }
  }

  const reminderResult = await syncActiveProjectTaskReminders({
    ...project,
    status: PROJECT_STATUS.ACTIVE,
    completedAt: null,
    archivedAt: null
  });
  const progress = await recalculateProjectProgress(project._id);

  if (reopened.stats && reopened.stats.updated) {
    await writeActivityLog({
      projectId: project._id, operatorId: openid,
      action: 'project.reopened',
      targetType: 'project', targetId: project._id,
      targetTitleSnapshot: project.title,
      before: { status: project.status, archivedAt: project.archivedAt || null },
      after: { status: PROJECT_STATUS.ACTIVE, completedAt: null, archivedAt: null },
      metadata: { restoredTaskCount: restoredTasks.length },
      visibleTo: [openid]
    });
  }

  return success({
    progress,
    alreadyReopened: !(reopened.stats && reopened.stats.updated),
    reminderWarning: reminderResult.warning
  }, '备忘录已重新打开');
}

async function recalculateProgressAction(payload, context) {
  const openid = auth.getUserId(context); const check = validateObjectId(payload.projectId);
  if (!openid) return fail('UNAUTHORIZED', '无法获取用户身份'); if (!check.valid) return fail('INVALID_PARAMS', check.message);
  const project = await getOwnedProject(check.value, openid); if (!project) return fail('NOT_FOUND', '事件不存在或无权访问');
  return success({ progress: await recalculateProjectProgress(project._id) });
}

module.exports = {
  create, get, list, listDeleted, update,
  archive, restoreFromArchive, softDelete, restore, purge, clearTrash,
  complete, reopen,
  recalculateProgress: recalculateProgressAction
};


