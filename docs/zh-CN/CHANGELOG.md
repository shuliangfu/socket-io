# 变更日志

本项目的所有重要变更将记录在此文件中。

格式基于
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，并遵循[语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.0.4] - 2026-02-18

### 变更

- **许可证**：许可证变更为 Apache 2.0。
- **ServerOptions**：移除可选 `t?(key, params)`，改为
  `lang?: "en-US" | "zh-CN"`。 服务端使用包内 i18n；构造时设置 `lang`
  可固定语言，不设置则按环境变量 LANGUAGE/LC_ALL/LANG 检测。
- **客户端**：客户端导入改为使用本地模块（`./encryption-manager.ts`、
  `./engine-parser.ts`、`./socketio-parser.ts`），便于打包时只打客户端代码、
  不拉取服务端路径。

### 新增

- **i18n（源码）**：服务端集成 `@dreamer/i18n`。入口调用 `initSocketIoI18n()`
  加载 en-US/zh-CN；日志与错误信息统一走
  `$t()`。EncryptionManager、engine/parser、
  socketio/parser、stream-parser、hardware-accel 等错误/警告文案改为 i18n key
  (如 `errors.encryptFailed`、`warnings.wasmUnavailable`)。`Server#tr()`
  使用包内 `$t()`。
- **i18n 翻译（文档）**：README、CHANGELOG、TEST_REPORT、客户端 README 的完整
  英文与中文翻译（docs/en-US、docs/zh-CN）。根目录 README 精简；客户端 README 从
  src 迁至 docs。

### 更新

- **测试报告**：测试报告已更新，203 个测试通过（Deno 与 Bun）。英文与中文
  TEST_REPORT.md 保持同步。

---

## [1.0.3] - 2026-02-07

### 新增

- **导出**：新增 `./types` 导出，映射到 `./src/types.ts`，支持直接导入
  `EnginePacketType` 与 `SocketIOPacketType`。修复 esbuild resolver
  在打包客户端代码时解析 JSR 包内相对路径导入失败的问题（如 client 模块中的
  `../types.ts`）。

---

## [1.0.2] - 2026-02-07

### 修复

- **CompressionManager**：修复向 `WritableStreamDefaultWriter.write()` 传入
  buffer 时的 TypeScript 错误
  `TS2315: Type 'Uint8Array' is not generic`。将无效的 `Uint8Array<ArrayBuffer>`
  断言改为 `BufferSource`，以兼容不同环境的严格类型检查（Deno/Bun）。

---

## [1.0.1] - 2026-02-07

### 修复

#### 客户端：用户主动断开连接时不再触发自动重连

- **问题**：当用户显式调用 `client.disconnect()` 时（例如在 React/Preact 的
  `useEffect` 清理函数中，页面切换时），Client 内部的 `disconnect`
  事件处理器仍会因 `autoReconnect` 而触发 `scheduleReconnect()`，导致：
  - 组件卸载后仍在进行重连尝试
  - 在 SPA 中反复切换页面时多次建立 Socket.IO 连接
  - 网络面板中出现大量 `socket.io/?transport=polling` 请求（相同或不同 session
    ID）
- **解决方案**：新增 `intentionalDisconnect` 标志。调用 `disconnect()`
  时，在断开前将该标志设为 `true`。`disconnect` 事件处理器检查该标志，若为 true
  则跳过 `scheduleReconnect()`。再次调用 `connect()`
  时（例如用户手动重连）会重置该标志。
- **影响**：在页面组件中创建 Client 并在清理函数中调用 `disconnect()`
  的用户，在切换页面时将不再出现重复连接或多余请求。网络故障或服务端重启后的自动重连仍会正常工作。

---

## [1.0.0] - 2026-02-06

### 新增

首个稳定版本。完整 Socket.IO 实现，支持服务端与客户端，兼容 Deno 与
Bun。实时双向通信、房间管理、命名空间、消息加密、分布式适配器。

（详细说明见 [CHANGELOG.md](./CHANGELOG.md)）
