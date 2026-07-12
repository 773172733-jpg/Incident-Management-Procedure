# 事件树

单人版 V1.0 — 一个微信小程序，帮你把大事件拆成小任务，专注推进每个目标。

## 技术栈

- 微信小程序原生（JavaScript + WXML + WXSS）
- 微信云开发 / CloudBase
- 云数据库 + 云函数 + 云存储 + 定时触发器

## 项目结构

```
event-tree/
├─ miniprogram/          # 客户端代码
│  ├─ app.js / app.json / app.wxss
│  ├─ assets/            # 图标和图片
│  ├─ components/        # 复用组件（后续阶段添加）
│  ├─ pages/             # 页面
│  ├─ services/          # 云函数调用层
│  ├─ utils/             # 工具函数
│  ├─ constants/         # 枚举和配置
│  └─ styles/            # 样式文件
├─ cloudfunctions/       # 云函数
│  ├─ api/               # 统一业务入口
│  └─ reminder-worker/   # 定时提醒
├─ database/             # 数据库文档
└─ docs/                 # 产品和技术文档
```

## 开发阶段

| 阶段 | 内容 |
|------|------|
| 0 | 项目骨架（目录、样式、云函数路由、数据库、bootstrap） |
| 1 | 首页与大事件（创建、编辑、列表、筛选） |
| 2 | 分支任务（CRUD、分组、排序、完成/重新打开） |
| 3 | 结束逻辑（手动结束、提前结束、closed_by_parent、重新打开） |
| 4 | 日历与动态（月历、待处理、时间流） |
| 5 | 提醒（reminder-worker、订阅消息） |
| 6 | 稳定性（空状态、骨架屏、错误处理、回收站、上架准备） |

## 开始使用

1. 在微信公众平台注册小程序，获取 AppID
2. 确认 `project.config.json` 中的 `appid` 属于当前小程序
3. 在微信开发者工具中导入此项目
4. 开通云开发，并在开发者工具中选择默认云环境；如需固定环境，可在 `miniprogram/constants/config.js` 填写完整环境 ID
5. 创建 6 个数据库集合（参考 `database/collections.md`）
6. 创建数据库索引（参考 `database/indexes.md`）
7. 右键目录上传云函数 `cloudfunctions/api` 和 `cloudfunctions/reminder-worker`
8. 编译运行

## 设计规范

- 白底、浅灰背景（#F7F8FA）
- 主色：橙色 #FF6B35
- 圆角卡片（16px）、轻阴影
- 大留白、极简动效
- 底部导航：首页、日历、动态、我的
