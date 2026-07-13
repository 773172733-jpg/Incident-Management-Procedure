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
| status + triggerAt | 否 |
| userId + status + triggerAt | 否 |
| taskId + status | 否 |
| dedupeKey | 建议唯一 |

## 6. activity_logs

| 索引字段 | 唯一 |
|----------|------|
| operatorId + createdAt | 列表查询（按用户+时间倒序） | 否 |
| projectId + createdAt | 项目详情页操作记录 | 否 |
| operatorId + targetType + createdAt | 类型筛选（事件/任务/分组） | 否 |
| operatorId + action + createdAt | 动作类型筛选 | 否 |
| visibleTo + createdAt | 团队版预留 | 否 |

## 创建方式

在云开发控制台的数据库管理页，为每个集合添加对应的索引。

或在初始化脚本中通过 cloudbase 管理 API 创建。
