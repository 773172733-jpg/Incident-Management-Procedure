# CloudBase `api` 云函数部署

## 部署前检查

在项目根目录运行：

```bash
node scripts/check-cloudfunction.js
```

项目必须从仓库根目录导入微信开发者工具。该目录的 `project.config.json` 指向：

- `miniprogramRoot`: `miniprogram/`
- `cloudfunctionRoot`: `cloudfunctions/`

`miniprogram/constants/config.js` 中 `DB_ENV` 留空表示使用开发者工具当前选择的默认云环境；如需固定环境，只填写控制台中真实存在的环境 ID。

## 清理失败资源并重新部署

1. 在云开发控制台的云函数列表删除处于 `CreateFailed` 状态的旧 `api`。
2. 回到开发者工具，在 `cloudfunctions` 根目录选择目标云环境。
3. 确认当前环境就是小程序要使用的环境。
4. 右键 `cloudfunctions/api`。
5. 选择“上传并部署：云端安装依赖”。
6. 等待创建完成，不要连续重复点击。
7. 在云函数列表确认 `api` 状态正常。
8. 清除开发者工具缓存。
9. 重新编译。

## Console 验证

```js
wx.cloud.callFunction({
  name: 'api',
  data: {
    module: 'user',
    action: 'bootstrap',
    payload: {}
  }
}).then(({ result }) => console.log('user.bootstrap:', result))
  .catch(error => console.error('user.bootstrap failed:', error));
```

成功响应应为 `{ success, code, message, data }`。随后再测试创建事件。若失败，在“云开发 → 云函数 → api → 日志”查看对应请求日志与堆栈。
