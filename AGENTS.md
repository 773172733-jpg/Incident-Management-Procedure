# AGENTS.md — 事件树微信小程序

## 项目目标
开发微信原生小程序“事件树”。

V1只做单人版：
- 创建大事件；
- 大事件支持“不设置时间 / 设置起止期间 / 持续进行”；
- 大事件下创建分支任务；
- 分支支持分组、优先级、时间、提醒、完成、重新打开和排序；
- 所有分支完成后只提示用户是否结束大事件，不自动结束；
- 用户可提前结束大事件，未完成分支必须标记为 `closed_by_parent`，不得算作已完成。

底层预留团队版：
- 创建者 creatorId；
- 数据所有者 ownerId；
- 负责人 assigneeId；
- 所属团队 teamId；
- 来源 sourceType；
- 可见范围 visibility；
- 验收 approvalRequired；
- 操作日志 activity_logs。

V1界面不得出现未完成的团队、会员、AI或支付入口。

## 固定技术栈
- 微信小程序原生
- JavaScript
- WXML
- WXSS
- 微信云开发 / CloudBase
- 云数据库
- 云函数
- 云存储
- 定时触发器

禁止擅自改用 uni-app、Taro、Vue、React 或纯本地存储。

## 开始工作前
每次开始前必须读取：
1. 本文件；
2. `docs/事件树微信小程序_单人版架构与团队预留_V1.0.md`；
3. `docs/UI_SPEC.md`；
4. `docs/CODEX_HANDOFF.md`；
5. 当前任务对应的 prompt 文件。

先扫描项目现状和相关调用链，再修改代码。保留已能运行的部分，不得无理由整体重写。

## 身份与权限
- 客户端不得决定 OPENID。
- 前端传入的 ownerId、creatorId、assigneeId 一律忽略。
- 这些字段由云函数根据当前用户身份写入。
- V1 中三者相同，但必须分别保存。
- 所有新增、修改、完成、删除、恢复操作都通过云函数。
- 所有关键操作写入 `activity_logs`。
- 权限逻辑集中在 `cloudfunctions/api/common/permission.js`。

## 状态与进度
大事件：
- active
- completed
- archived
- cancelled

任务：
- todo
- doing
- completed
- closed_by_parent
- cancelled
- submitted
- approved
- rejected

提前结束大事件：
- 未完成任务改为 `closed_by_parent`；
- 保存 `statusBeforeParentClose`；
- 不得算完成；
- 显示“已结束 · 实际完成 5/9”，不得显示虚假100%。

重新打开：
- `closed_by_parent` 恢复原状态；
- 真正完成的任务保持完成；
- 写入日志。

## UI规则
视觉关键词：
清爽、轻量、白底、浅灰背景、橙色主色、大留白、圆角卡片、轻阴影、信息清晰、微信原生感、非游戏化。

固定颜色：
- 主色 `#FF6B35`
- 主色浅底 `#FFF1EA`
- 页面背景 `#F7F8FA`
- 卡片 `#FFFFFF`
- 主文字 `#1F2329`
- 次文字 `#8A9099`
- 分割线 `#EEF0F3`
- 成功 `#22B573`
- 警告 `#F6B90A`
- 危险 `#F04A4A`

底部导航固定：
- 首页
- 日历
- 动态
- 我的

禁止：
- 黑色科技风；
- 玻璃拟态；
- 大面积强渐变；
- 像素风；
- 复杂插画背景；
- 用大量 emoji 代替正式图标；
- 擅自增加团队、会员和 AI 灰色入口。

## 编码纪律
- 页面不得散落直接调用 `wx.cloud.callFunction`，统一经过 `services/api.js`。
- 云函数统一返回 `{ success, code, message, data }`。
- 所有输入在云端重新校验。
- 所有枚举集中管理。
- 不写伪代码，不写“此处省略”或“自行实现”。
- 保存按钮防重复点击。
- 完整处理加载、空状态、失败、重试。
- 不做当前任务之外的大规模重构。
- 修改后主动检查引用关系和语法。

## 完成任务后的报告
每次必须说明：
1. 做了什么；
2. 修改了哪些文件；
3. 是否增加数据库集合或索引；
4. 是否需要重新上传云函数；
5. 微信开发者工具测试步骤；
6. 已运行的检查；
7. 尚未验证的问题。
