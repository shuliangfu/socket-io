# @dreamer/socket.io

> 一个高性能、跨运行时的 Socket.IO 实现，兼容 Deno 和
> Bun，提供完整的实时双向通信解决方案

[English](../../README.md) | 中文 (Chinese)

[![JSR](https://jsr.io/badges/@dreamer/socket.io)](https://jsr.io/@dreamer/socket.io)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-203%20passed-brightgreen)](../en-US/TEST_REPORT.md)

---

## 🎯 功能特性

`@dreamer/socket.io` 是一个完整的 Socket.IO
实现，提供了服务端和客户端的所有核心功能，支持实时双向通信、房间管理、命名空间隔离、消息加密等高级特性。适用于构建实时聊天应用、在线协作工具、实时推送服务、多人游戏、IoT
设备通信等场景。

---

## ✨ 特性

### 核心功能

- **跨运行时支持**：
  - 原生支持 Deno 2.6+ 和 Bun 1.3.5，无需 Node.js
  - 统一的 Socket.IO API，代码可在不同运行时无缝切换
  - 基于 @dreamer/runtime-adapter 实现运行时抽象

- **多种传输方式**：
  - WebSocket 传输（首选，低延迟、高性能）
  - HTTP 长轮询传输（自动降级，兼容性更好）
  - 智能传输升级和降级机制
  - 支持传输方式配置和限制

- **完整的 Socket.IO 协议**：
  - Engine.IO 协议完整实现（握手、心跳、数据包）
  - Socket.IO 协议完整实现（连接、事件、确认）
  - 支持二进制数据包传输
  - 协议解析器缓存优化

### 高级功能

- **房间管理系统**：
  - 动态房间创建和销毁
  - Socket 加入/离开房间
  - 房间内消息广播（支持排除发送者）
  - 房间状态查询和管理
  - 双向索引优化，O(1) 复杂度

- **命名空间隔离**：
  - 支持多个命名空间，隔离不同业务场景
  - 每个命名空间独立的连接池和事件系统
  - 动态命名空间创建和管理
  - 支持默认命名空间（"/"）

- **事件系统**：
  - 连接生命周期事件（connect、disconnect、error）
  - 自定义事件发送和监听
  - 事件确认机制（acknowledgments）
  - 一次性事件监听（once）
  - 支持事件监听器批量管理（removeAllListeners）

- **客户端功能**：
  - 自动连接和手动连接控制
  - 智能自动重连机制（可配置策略）
  - 消息队列（连接前消息缓存）
  - 连接状态管理和查询

### 性能优化

- **消息压缩**：
  - gzip 和 deflate 压缩算法支持
  - 自动压缩大消息，减少网络传输
  - 压缩数据检测和自动解压

- **流式处理**：
  - 大数据包分块传输
  - 流式解析器，支持增量处理
  - 最大数据包大小限制

- **硬件加速**：
  - WebAssembly 和 SIMD 支持
  - 批量哈希计算优化
  - 批量数据操作优化

- **缓存优化**：
  - 消息序列化缓存（LRU）
  - 解析器结果缓存
  - 加密结果缓存

### 安全特性

- **消息加密**：
  - AES-256-GCM 和 AES-128-GCM 加密算法
  - 自动加密/解密 MESSAGE 类型数据包
  - 密钥管理和密码派生
  - 加密消息检测

### 分布式支持

- **适配器系统**：
  - 内存适配器（默认，单服务器场景）
  - Redis 适配器（多服务器部署，Pub/Sub 通信）
  - MongoDB 适配器（多服务器部署，Change Streams 支持）
  - 适配器接口统一，易于扩展

- **跨服务器通信**：
  - 房间同步（跨服务器房间管理）
  - 消息广播（跨服务器消息传递）
  - 服务器心跳和状态管理

---

## 🎨 设计原则

__所有 @dreamer/_ 包都遵循以下原则_*：

- **主包（@dreamer/xxx）**：用于服务端（兼容 Deno 和 Bun 运行时）
- **客户端子包（@dreamer/xxx/client）**：用于客户端（浏览器环境）

这样可以：

- 明确区分服务端和客户端代码
- 避免在客户端代码中引入服务端依赖
- 提供更好的类型安全和代码提示
- 支持更好的 tree-shaking

---

## 🎯 使用场景

- **实时通信**：聊天应用、在线客服、实时通知
- **推送服务**：消息推送、状态更新、数据同步
- **在线协作**：协同编辑、实时白板、多人游戏
- **监控和日志**：实时日志流、系统监控、性能指标
- **IoT 应用**：设备控制、数据采集、远程监控

---

## 📦 安装

### Deno

```bash
deno add jsr:@dreamer/socket.io
```

### Bun

```bash
bunx jsr add @dreamer/socket.io
```

---

## 🌍 环境兼容性

| 环境       | 版本要求 | 状态                                                             |
| ---------- | -------- | ---------------------------------------------------------------- |
| **Deno**   | 2.6+     | ✅ 完全支持                                                      |
| **Bun**    | 1.3.5    | ✅ 完全支持                                                      |
| **服务端** | -        | ✅ 支持（兼容 Deno 和 Bun 运行时）                               |
| **客户端** | -        | ✅ 支持（浏览器环境，通过 `jsr:@dreamer/socket.io/client` 使用） |
| **依赖**   | -        | 📦 @dreamer/runtime-adapter（用于跨运行时兼容）                  |

---

## 🚀 快速开始

### 基础服务器

```typescript
import { Server } from "jsr:@dreamer/socket.io";

// 创建 Socket.IO 服务器
const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

// 连接建立事件
io.on("connection", (socket) => {
  console.log("新连接建立:", socket.id);

  // 监听自定义事件
  socket.on("chat-message", (data) => {
    console.log("收到聊天消息:", data);

    // 发送事件
    socket.emit("chat-response", {
      status: "success",
      message: "消息已收到",
    });
  });

  // 断开连接事件
  socket.on("disconnect", (reason) => {
    console.log("连接断开:", socket.id, reason);
  });
});

// 启动服务器
await io.listen();
console.log("Socket.IO 服务器运行在 http://localhost:3000");
```

### 基础客户端（浏览器）

```typescript
import { Client } from "jsr:@dreamer/socket.io/client";

const client = new Client({
  url: "http://localhost:3000",
  namespace: "/",
  autoConnect: true,
  autoReconnect: true,
});

client.on("connect", () => {
  console.log("已连接，Socket ID:", client.getId());
  client.emit("chat-message", { text: "Hello!" });
});

client.on("chat-response", (data) => {
  console.log("收到响应:", data);
});

client.on("disconnect", (reason) => {
  console.log("断开连接:", reason);
});
```

### 房间管理

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

io.on("connection", (socket) => {
  // 加入房间
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`用户 ${socket.id} 加入房间 ${roomId}`);

    // 通知房间内其他用户
    io.of("/").to(roomId).emit("user-joined", {
      userId: socket.id,
    });
  });

  // 离开房间
  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    console.log(`用户 ${socket.id} 离开房间 ${roomId}`);

    // 通知房间内其他用户
    io.of("/").to(roomId).emit("user-left", {
      userId: socket.id,
    });
  });

  // 房间内消息广播
  socket.on("room-message", (data) => {
    const { roomId, message } = data;
    // 向房间内所有用户（除了发送者）广播消息
    io.of("/").to(roomId).emit("room-message", {
      userId: socket.id,
      message: message,
    });
  });
});

await io.listen();
```

### 命名空间

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

// 默认命名空间
io.on("connection", (socket) => {
  socket.on("message", (data) => {
    socket.emit("response", { message: "来自默认命名空间" });
  });
});

// 创建聊天命名空间
const chatNamespace = io.of("/chat");
chatNamespace.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    // 向聊天命名空间内所有用户广播
    chatNamespace.emit("chat-message", {
      userId: socket.id,
      message: data.message,
    });
  });
});

// 创建游戏命名空间
const gameNamespace = io.of("/game");
gameNamespace.on("connection", (socket) => {
  socket.on("game-action", (data) => {
    if (data.roomId) {
      gameNamespace.to(data.roomId).emit("game-action", {
        userId: socket.id,
        action: data.action,
      });
    }
  });
});

await io.listen();
```

### 服务器级事件发送

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

await io.listen();

// 向默认命名空间的所有 Socket 发送事件
io.emit("server-announcement", { message: "服务器维护通知" });

// 向默认命名空间的房间发送事件
io.to("room-123").emit("room-notification", { message: "房间通知" });

// 排除某些 Socket
io.except("socket-id-456").emit("broadcast-message", { message: "广播消息" });

// 获取所有 Socket ID
const allSocketIds = await io.allSockets();
console.log(`当前有 ${allSocketIds.size} 个连接`);

// 批量操作
await io.socketsJoin("room-123"); // 所有 Socket 加入房间
await io.socketsLeave("room-123"); // 所有 Socket 离开房间
await io.disconnectSockets(); // 断开所有连接
```

### Socket 高级功能

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

io.on("connection", (socket) => {
  // 一次性事件监听
  socket.once("welcome", (data) => {
    console.log("收到欢迎消息（只接收一次）:", data);
  });

  // 向房间发送消息（不包括自己）
  socket.to("room-123").emit("room-message", { text: "Hello" });

  // 向所有其他 Socket 广播（不包括自己）
  socket.broadcast.emit("user-joined", { userId: socket.id });

  // 链式调用：向房间发送，排除某些 Socket
  socket.to("room-123").except("socket-id-456").emit("message", data);

  // 压缩大消息
  socket.compress(true).emit("large-data", largeObject);

  // 获取 Socket 所在的房间
  const rooms = socket.rooms;
  console.log(`Socket ${socket.id} 在 ${rooms.size} 个房间中`);

  // 移除所有事件监听器
  socket.on("cleanup", () => {
    socket.removeAllListeners("chat-message");
  });
});

await io.listen();
```

### 命名空间批量操作

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

const chatNamespace = io.of("/chat");

chatNamespace.on("connection", (socket) => {
  // 命名空间级别的操作
});

// 批量操作命名空间内的所有 Socket
await chatNamespace.socketsJoin("general-room");
await chatNamespace.socketsLeave("general-room");

// 获取所有 Socket 实例
const sockets = await chatNamespace.fetchSockets();
console.log(`命名空间有 ${sockets.length} 个 Socket`);

// 批量断开连接
await chatNamespace.disconnectSockets();

await io.listen();
```

### 分布式部署（Redis 适配器）

```typescript
import { Server } from "jsr:@dreamer/socket.io";
import { RedisAdapter } from "jsr:@dreamer/socket.io/adapters";

// 创建使用 Redis 适配器的 Socket.IO 服务器
const io = new Server({
  port: 3000,
  path: "/socket.io/",
  adapter: new RedisAdapter({
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
    keyPrefix: "socket.io",
    heartbeatInterval: 30,
  }),
});

io.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    // 消息会通过 Redis 同步到其他服务器实例
    socket.to("chat-room").emit("chat-message", data);
  });
});

await io.listen();
```

**注意**：使用 Redis 适配器需要安装 `redis` 包：

```bash
deno add npm:redis
```

### 调试与日志（debug / logger / lang）

创建 Server 时可传入 **debug**、**logger** 和
**lang**，便于排查连接与握手问题，并支持日志与错误信息的国际化：

```typescript
import { createLogger } from "@dreamer/logger";
import { Server } from "jsr:@dreamer/socket.io";

const logger = createLogger({ level: "debug", format: "text" });

const io = new Server({
  port: 3000,
  path: "/socket.io/",
  debug: true, // 输出握手、轮询、WebSocket 等详细调试信息
  logger, // 所有 info/debug 通过 logger 输出，不使用 console
  lang: "zh-CN", // 或 "en-US"；不传则根据环境变量 LANGUAGE/LC_ALL/LANG 自动检测
});

io.on("connection", (socket) => {
  // ...
});
await io.listen();
```

日志与错误信息使用包内 i18n（中/英）。在构造函数中设置 **lang**
可固定语言；不设置则按环境变量检测。

### 分布式部署（MongoDB 适配器）

```typescript
import { Server } from "jsr:@dreamer/socket.io";
import { MongoDBAdapter } from "jsr:@dreamer/socket.io/adapters";

// 创建使用 MongoDB 适配器的 Socket.IO 服务器
const io = new Server({
  port: 3000,
  path: "/socket.io/",
  adapter: new MongoDBAdapter({
    connection: {
      host: "127.0.0.1",
      port: 27017,
      database: "socket_io",
      // 可选：如果使用副本集，启用 Change Streams（推荐）
      // replicaSet: "rs0",
    },
    keyPrefix: "socket.io",
    heartbeatInterval: 30,
  }),
});

io.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    // 消息会通过 MongoDB 同步到其他服务器实例
    socket.to("chat-room").emit("chat-message", data);
  });
});

await io.listen();
```

**注意**：使用 MongoDB 适配器需要安装 `mongodb` 包：

```bash
deno add npm:mongodb
```

**MongoDB 适配器工作模式**：

- **副本集模式**：使用 Change Streams，实时监听消息变更（推荐，性能更好）
- **单节点模式**：使用轮询，每 500ms 检查一次新消息（自动降级，延迟较高）

---

## 📚 API 文档

### Server

Socket.IO 服务器类，管理所有连接和事件。

**构造函数**：

```typescript
new Server(options?: ServerOptions)
```

**选项**：

| 参数                   | 类型                 | 默认值                     | 说明                              |
| ---------------------- | -------------------- | -------------------------- | --------------------------------- |
| `host`                 | `string`             | `"0.0.0.0"`                | 主机地址                          |
| `port`                 | `number`             | `3000`                     | 端口号                            |
| `path`                 | `string`             | `"/socket.io/"`            | Socket.IO 路径                    |
| `transports`           | `TransportType[]`    | `["websocket", "polling"]` | 允许的传输方式                    |
| `pingTimeout`          | `number`             | `20000`                    | 心跳超时（毫秒）                  |
| `pingInterval`         | `number`             | `25000`                    | 心跳间隔（毫秒）                  |
| `allowPolling`         | `boolean`            | `true`                     | 是否允许 HTTP 长轮询              |
| `pollingTimeout`       | `number`             | `60000`                    | 轮询超时（毫秒）                  |
| `allowCORS`            | `boolean`            | `true`                     | 是否允许跨域                      |
| `cors`                 | `CorsOptions`        | -                          | CORS 配置                         |
| `maxConnections`       | `number`             | 无限制                     | 最大连接数                        |
| `connectTimeout`       | `number`             | `45000`                    | 连接超时（毫秒）                  |
| `compression`          | `boolean`            | `false`                    | 是否启用消息压缩                  |
| `streaming`            | `boolean`            | `false`                    | 是否启用流式处理（大数据包）      |
| `maxPacketSize`        | `number`             | `10 * 1024 * 1024`         | 最大数据包大小（字节，默认 10MB） |
| `hardwareAcceleration` | `boolean`            | `false`                    | 是否启用硬件加速                  |
| `adapter`              | `SocketIOAdapter`    | 内存适配器                 | 分布式适配器                      |
| `encryption`           | `EncryptionConfig`   | -                          | 消息加密配置                      |
| `debug`                | `boolean`            | `false`                    | 是否启用调试日志                  |
| `logger`               | `Logger`             | 默认 logger                | 日志实例                          |
| `lang`                 | `"en-US" \| "zh-CN"` | 环境变量检测               | 日志与错误信息的语言              |

**方法**：

- `listen(host?: string, port?: number): Promise<void>`: 启动服务器
- `close(): Promise<void>`: 关闭服务器
- `on(event: "connection", listener: ServerEventListener): void`: 监听连接事件
- `of(name: string): Namespace`: 创建或获取命名空间
- `emit(event: string, data?: any): void`: 向默认命名空间的所有 Socket 发送事件
- `to(room: string): { emit: (event: string, data?: any) => void }`:
  向默认命名空间的房间发送事件
- `in(room: string): { emit: (event: string, data?: any) => void }`: `to()`
  的别名
- `except(room: string | string[]): { emit: (event: string, data?: any) => void }`:
  排除指定房间或 Socket ID
- `allSockets(): Promise<Set<string>>`: 获取所有 Socket ID
- `fetchSockets(): Promise<SocketIOSocket[]>`: 获取所有 Socket 实例
- `socketsJoin(room: string): Promise<void>`: 批量加入房间
- `socketsLeave(room: string): Promise<void>`: 批量离开房间
- `disconnectSockets(close?: boolean): Promise<void>`: 批量断开连接
- `serverSideEmit(event: string, ...args: any[]): void`:
  服务器端事件发送（用于跨服务器通信）

### Socket

Socket.IO 连接类，表示一个客户端连接。

**方法**：

- `emit(event: string, data?: any, callback?: Function): void`: 发送事件
- `on(event: string, listener: SocketEventListener): void`: 监听事件
- `off(event: string, listener?: SocketEventListener): void`: 移除监听器
- `once(event: string, listener: SocketEventListener): void`: 只监听一次事件
- `removeAllListeners(event?: string): this`:
  移除所有事件监听器（或指定事件的监听器）
- `join(room: string): void`: 加入房间
- `leave(room: string): void`: 离开房间
- `to(room: string): { emit: (event: string, data?: any) => void }`:
  向房间发送事件（不包括自己）
- `in(room: string): { emit: (event: string, data?: any) => void }`: `to()`
  的别名
- `except(room: string | string[]): { emit: (event: string, data?: any) => void }`:
  排除指定房间或 Socket ID
- `broadcast: { emit: (event: string, data?: any) => void }`: 向所有其他 Socket
  广播消息（不包括自己）
- `compress(value: boolean): this`: 设置是否压缩下一次发送的消息
- `getRooms(): Set<string>`: 获取 Socket 所在的房间列表
- `getServer(): Server | undefined`: 获取关联的 Server 实例（与
  @dreamer/websocket 对齐）
- `disconnect(reason?: string): void`: 断开连接

**属性**：

- `id: string`: Socket 唯一标识
- `nsp: string`: 命名空间
- `handshake: Handshake`: 握手信息
- `data: SocketData`: 数据存储对象
- `connected: boolean`: 连接状态
- `rooms: Set<string>`: Socket 所在的房间列表（只读）

### Client

Socket.IO 客户端类，用于浏览器环境连接服务端。通过
`jsr:@dreamer/socket.io/client` 引入。

**构造函数**：

```typescript
new Client(options: ClientOptions)
```

**选项**：

| 参数                   | 类型                     | 默认值                     | 说明                           |
| ---------------------- | ------------------------ | -------------------------- | ------------------------------ |
| `url`                  | `string`                 | 必填                       | 服务器 URL                     |
| `namespace`            | `string`                 | `"/"`                      | 命名空间                       |
| `query`                | `Record<string, string>` | -                          | 连接时的查询参数               |
| `autoConnect`          | `boolean`                | `true`                     | 是否自动连接                   |
| `autoReconnect`        | `boolean`                | `true`                     | 是否自动重连                   |
| `reconnectionDelay`    | `number`                 | `1000`                     | 重连延迟（毫秒）               |
| `reconnectionDelayMax` | `number`                 | `5000`                     | 最大重连延迟（毫秒）           |
| `reconnectionAttempts` | `number`                 | `Infinity`                 | 重连尝试次数                   |
| `transports`           | `TransportType[]`        | `["websocket", "polling"]` | 传输方式优先级                 |
| `forceNew`             | `boolean`                | `false`                    | 是否强制新建连接               |
| `timeout`              | `number`                 | `20000`                    | 连接超时（毫秒）               |
| `encryption`           | `EncryptionConfig`       | -                          | 消息加密配置（需与服务端一致） |

**方法**：

- `connect(): Promise<void>`: 手动连接
- `disconnect(): void`: 断开连接
- `getId(): string`: 获取 Socket ID（连接建立后有效）
- `emit(event: string, data?: unknown): void`: 发送事件
- `on(event: string, listener: ClientEventListener): void`: 监听事件
- `off(event: string, listener?: ClientEventListener): void`: 移除监听器
- `once(event: string, listener: ClientEventListener): void`: 只监听一次

**事件**：`connect`、`disconnect`、`connect_error`、`reconnecting`、`reconnect_failed`、`message`
及自定义事件

### Namespace

命名空间类，管理命名空间内的 Socket 连接。

**方法**：

- `on(event: "connection", listener: ServerEventListener): void`: 监听连接事件
- `emit(event: string, data?: any): void`: 向所有 Socket 发送事件
- `to(room: string): { emit: (event: string, data?: any) => void }`:
  向房间发送事件
- `in(room: string): { emit: (event: string, data?: any) => void }`: `to()`
  的别名
- `except(room: string | string[]): { emit: (event: string, data?: any) => void }`:
  排除指定房间或 Socket ID
- `getSocket(socketId: string): SocketIOSocket | undefined`: 获取 Socket
- `getSockets(): Map<string, SocketIOSocket>`: 获取所有 Socket
- `socketsJoin(room: string): Promise<void>`: 批量加入房间
- `socketsLeave(room: string): Promise<void>`: 批量离开房间
- `fetchSockets(): Promise<SocketIOSocket[]>`: 获取所有 Socket 实例
- `disconnectSockets(close?: boolean): Promise<void>`: 批量断开连接

### 适配器

适配器支持泛型，便于 mock 或使用自定义客户端实现：

- `RedisAdapter<TClient, TPubSubClient>`：可传入自定义 Redis 客户端类型
- `MongoDBAdapter<TClient>`：可传入自定义 MongoDB 客户端类型

#### RedisAdapter

Redis 分布式适配器，用于多服务器部署。

**选项**：

- `connection?: RedisConnectionConfig`: Redis 连接配置
- `client?: RedisClient`: Redis 客户端实例（可选）
- `pubsubConnection?: RedisConnectionConfig`: Redis Pub/Sub 连接配置（可选）
- `pubsubClient?: RedisPubSubClient`: Redis Pub/Sub 客户端实例（可选）
- `keyPrefix?: string`: 键前缀（默认："socket.io"）
- `heartbeatInterval?: number`: 服务器心跳间隔（秒，默认：30）

#### MongoDBAdapter

MongoDB 分布式适配器，用于多服务器部署。

**选项**：

- `connection: MongoDBConnectionConfig`: MongoDB 连接配置
- `keyPrefix?: string`: 键前缀（默认："socket.io"）
- `heartbeatInterval?: number`: 服务器心跳间隔（秒，默认：30）

**MongoDB 连接配置**：

- `url?: string`: MongoDB 连接 URL
- `host?: string`: 主机地址（默认："127.0.0.1"）
- `port?: number`: 端口（默认：27017）
- `database: string`: 数据库名称
- `username?: string`: 用户名（可选）
- `password?: string`: 密码（可选）
- `replicaSet?: string`: 副本集名称（可选，用于启用 Change Streams）
- `directConnection?: boolean`: 是否直接连接（可选）

#### EncryptionConfig

消息加密配置（服务端 `encryption` 与客户端 `encryption` 需一致）：

| 参数        | 类型                     | 默认值   | 说明                            |
| ----------- | ------------------------ | -------- | ------------------------------- |
| `key`       | `Uint8Array` 或 `string` | 必填     | 加密密钥                        |
| `algorithm` | `string`                 | 自动选择 | `aes-256-gcm`、`aes-128-gcm` 等 |
| `enabled`   | `boolean`                | `true`   | 是否启用加密                    |
| `cacheSize` | `number`                 | `1000`   | 加密缓存大小                    |
| `cacheTTL`  | `number`                 | `60000`  | 缓存过期时间（毫秒）            |

> **注意**：服务端与客户端的 `encryption` 配置必须一致，否则无法正常通信。

---

## 📝 备注

- **服务端和客户端分离**：通过 `/client` 子路径明确区分服务端和客户端代码
- **统一接口**：服务端和客户端使用相同的 API 接口，降低学习成本
- **自动降级**：如果 WebSocket 不可用，自动降级到 HTTP 长轮询
- **跨运行时支持**：原生支持 Deno 和 Bun 运行时，无需 Node.js
- **类型安全**：完整的 TypeScript 类型支持

---

## 📊 测试报告

详细报告：[TEST_REPORT.md](./TEST_REPORT.md)（中文） ·
[English](../en-US/TEST_REPORT.md)

**测试概览**:

- ✅ 总测试数: 203
- ✅ 通过率: 100%
- ✅ 执行时间: Deno ~44–45s / Bun ~38s
- ✅ 测试覆盖: 核心功能、边界情况、集成场景、优化功能（国际化、泛型、资源清理）

---

## 📋 变更日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

**最新 (v1.1.0 - 2026-05-04)**：**修复** – 用安全封装替换未绑定上下文的
`(logger?.error ?? console.error)(…)`、`(logger?.warn ?? console.warn)(…)`
调用， 保证 `@dreamer/logger` 在实例上调用，避免 WebSocket error 等路径出现
`Cannot read properties of undefined (reading 'log')`。详见
[CHANGELOG.md](./CHANGELOG.md)。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

Apache License 2.0 - 详见 [LICENSE](../../LICENSE)

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
