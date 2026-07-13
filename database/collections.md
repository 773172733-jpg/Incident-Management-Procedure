# 事件树 - 数据库集合

## 集合列表（6 个）

| 集合名 | 说明 | V1 必需 | 阶段 |
|--------|------|---------|------|
| users | 用户 | 是 | 0 |
| projects | 大事件 | 是 | 0 |
| project_groups | 大事件内部分组 | 是 | 0 |
| tasks | 分支任务 | 是 | 0 |
| reminders | 提醒 | 是 | 0 |
| activity_logs | 活动日志 | 是 | 0 |

## 创建方式

在微信开发者工具 → 云开发 → 数据库 中手动创建这 6 个集合。

## reminders 字段

```js
{
  ownerId: String,
  projectId: String,
  taskId: String,
  channel: 'in_app',
  reminderMode: 'at_due' | 'offset' | 'custom',
  offsetMinutes: Number | null,
  dueAt: Date,
  scheduledAt: Date,
  status: 'pending' | 'processing' | 'triggered' | 'read' | 'cancelled' | 'failed',
  dedupeKey: String,
  retryCount: Number,
  maxRetries: Number,
  nextRetryAt: Date | null,
  processingAt: Date | null,
  triggeredAt: Date | null,
  readAt: Date | null,
  cancelledAt: Date | null,
  failedAt: Date | null,
  lastError: String,
  taskTitleSnapshot: String,
  projectTitleSnapshot: String,
  createdAt: Date,
  updatedAt: Date
}
```

任务记录仅保存 `reminderMode`、`reminderOffsetMinutes`、`reminderCustomAt` 三个偏好字段，用于完成、删除或父事件关闭后按规则恢复，不保存队列状态。
