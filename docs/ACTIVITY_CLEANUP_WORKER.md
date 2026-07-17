# activity-cleanup-worker 部署说明

该云函数每天清理 `createdAt` 早于当前时间30天的 `activity_logs`。

## 数据库索引

在 `activity_logs` 集合创建非唯一单字段索引：

- `createdAt ASC`

该索引用于跨用户扫描过期记录。现有 `operatorId + createdAt` 和
`projectId + createdAt` 索引继续服务用户列表与项目列表查询。

## 部署

1. 上传部署 `cloudfunctions/api`，选择“云端安装依赖”。
2. 上传部署 `cloudfunctions/activity-cleanup-worker`，选择“云端安装依赖”。
3. 在云函数配置中确认触发器 `activity_cleanup_daily` 已生效。
4. 触发器表达式为 `0 20 3 * * * *`，每天低峰运行一次。

正常执行只输出一条汇总日志。若发现缺失或非法 `createdAt`，Worker 只记录数量，
不会删除这些异常记录。
