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
| assigneeId + status + dueAt | 否 |
| parentTaskId + sortOrder | 否 |
| groupId + sortOrder | 否 |

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
| projectId + createdAt | 否 |
| operatorId + createdAt | 否 |
| visibleTo + createdAt | 否 |

## 创建方式

在云开发控制台的数据库管理页，为每个集合添加对应的索引。

或在初始化脚本中通过 cloudbase 管理 API 创建。
