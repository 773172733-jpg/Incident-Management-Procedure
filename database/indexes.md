# 事件树 - 数据库索引

## 1. users

| 索引字段 | 唯一 |
|----------|------|
| openid | 是 |

## 2. projects

| 索引字段 | 唯一 |
|----------|------|
| ownerId + status + updatedAt | 否 |
| ownerId + deletedAt + updatedAt | 否 |
| assigneeId + status + updatedAt | 否 |
| creatorId + status + updatedAt | 否 |
| teamId + status + updatedAt (V2) | 否 |

## 3. project_groups

| 索引字段 | 唯一 |
|----------|------|
| projectId + sortOrder | 否 |
| ownerId + updatedAt | 否 |

## 4. tasks

| 索引字段 | 唯一 |
|----------|------|
| projectId + deletedAt + sortOrder | 否 |
| projectId + status + sortOrder | 否 |
| ownerId + status + dueAt | 否 |
| ownerId + deletedAt + status + dueAt | 否 |
| ownerId + deletedAt + scheduleType + dueAt | 否 |
| ownerId + deletedAt + scheduleType + startAt | 否 |
| ownerId + deletedAt + updatedAt | 否 |
| assigneeId + status + dueAt | 否 |
| parentTaskId + sortOrder | 否 |
| groupId + sortOrder | 否 |

`activity.pending` 依赖 `ownerId + deletedAt + status + dueAt` 复合索引，字段方向均为升序；接口按当前用户、未删除状态、任务状态和截止时间范围查询待处理任务。

阶段 4D 兼容旧 range 任务的 `endAt` 查询时，可能临时需要 `ownerId + deletedAt + status + scheduleType + endAt` 升序复合索引。新写入任务统一使用 `dueAt`，旧数据完成迁移后可评估移除该临时索引。

`calendar.month` 依赖以下两个复合索引，字段方向均为升序：

- `ownerId + deletedAt + scheduleType + dueAt`：查询本月截止的 deadline 任务。
- `ownerId + deletedAt + scheduleType + startAt`：查询开始时间不晚于月末的 range 任务，再在云函数内用 `dueAt || endAt` 判断是否与本月相交。

项目日历条目复用现有 `ownerId + deletedAt + updatedAt` 索引读取当前用户未删除项目，并在云函数内按月份生成日期键，因此本阶段不新增项目索引，也不需要旧 `endAt` 日历索引。

## 5. reminders

| 索引字段 | 唯一 |
|----------|------|
| ownerId ASC + status ASC + scheduledAt ASC | 否 |
| ownerId ASC + taskId ASC + channel ASC + status ASC | 否 |
| status ASC + scheduledAt ASC | 否 |
| status ASC + nextRetryAt ASC | 否 |
| status ASC + processingAt ASC | 否 |
| dedupeKey ASC | 是 |

- `ownerId + status + scheduledAt`：`reminder.listUnread` 查询当前用户未读提醒。
- `ownerId + taskId + channel + status`：`getByTask`、upsert 和任务联动查找同任务的 in_app 提醒。
- `status + scheduledAt`：worker 扫描到期的 pending 提醒。
- `status + nextRetryAt`：worker 扫描到达重试时间的 failed 提醒。
- `status + processingAt`：worker 回收超过 10 分钟仍为 processing 的中断任务。
- `dedupeKey`：唯一索引，保证每个用户、任务、channel 只有一条提醒记录。

创建 `dedupeKey` 唯一索引前，应先在控制台确认现有记录没有重复值，也没有多条缺失该字段的旧记录。若构建失败，先记录冲突数据并人工处理；本阶段不自动批量迁移旧提醒。

## 6. activity_logs

| 索引字段 | 唯一 |
|----------|------|
| operatorId + createdAt | 列表查询（按用户+时间倒序） | 否 |
| projectId + createdAt | 项目详情页操作记录 | 否 |
| operatorId + targetType + createdAt | 类型筛选（事件/任务/分组） | 否 |
| operatorId + action + createdAt | 动作类型筛选 | 否 |
| visibleTo + createdAt | 团队版预留 | 否 |
| createdAt | 每日清理超过30天的操作记录 | 否 |

`activity-cleanup-worker` 跨用户按 `createdAt` 查询过期记录，需创建 `createdAt ASC` 单字段非唯一索引。现有带 `operatorId` 或 `projectId` 前缀的复合索引不能替代该全局清理查询。

## 创建方式

在云开发控制台的数据库管理页，为每个集合添加对应的索引。

或在初始化脚本中通过 cloudbase 管理 API 创建。
