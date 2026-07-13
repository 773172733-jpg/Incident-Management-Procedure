# reminder-worker 部署与触发器

阶段 5B 的 worker 只处理 `in_app` 提醒，不发送微信订阅消息。

## 部署

1. 在微信开发者工具中上传并部署 `cloudfunctions/reminder-worker`。
2. 选择云端安装依赖。
3. 确认云函数能够访问 `reminders`、`tasks`、`projects` 集合。

## 定时触发器

在 CloudBase 控制台打开 `reminder-worker` 的触发器配置：

1. 新建定时触发器。
2. 频率选择每 5 分钟一次。
3. 目标函数选择 `reminder-worker`。
4. 保存后通过函数日志确认每次执行返回统计对象。

如果控制台要求填写 Cron 表达式，请使用控制台提供的“每 5 分钟”模板或生成器，避免因不同控制台版本的 Cron 字段格式差异而手写错误。

触发器必须由用户在云端控制台创建；代码部署不会自动创建触发器。

## 处理规则

- 扫描 `pending` 且 `scheduledAt <= now` 的提醒。
- 单条条件更新为 `processing`，并发 worker 只有一个能抢占成功。
- 超过 10 分钟仍为 `processing` 的记录允许重新抢占。
- in_app 提醒到点后变为 `triggered`，用户查看后变为 `read`。
- 单条异常进入有限重试，重试间隔 5 分钟，超过 `maxRetries` 后保留为 `failed`。
