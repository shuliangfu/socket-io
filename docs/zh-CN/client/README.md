# Socket.IO 客户端

Socket.IO 客户端库，用于浏览器环境，提供实时双向通信功能。

## 功能特性

- **多种传输方式**：支持 WebSocket 和 HTTP 长轮询
- **自动降级**：从 WebSocket 自动降级到 HTTP 长轮询
- **自动重连**：支持自动重连机制，可配置重连策略
- **事件系统**：连接事件、消息事件、自定义事件支持
- **一次性事件监听**：支持 `once()` 方法，只监听一次事件
- **事件监听器管理**：支持 `removeAllListeners()` 批量移除监听器
- **命名空间**：支持命名空间隔离不同业务场景
- **事件确认**：支持事件确认机制（acknowledgments）

## 安装

### Deno

```bash
deno add jsr:@dreamer/socket.io/client
```

### Bun

```bash
bunx jsr add @dreamer/socket.io/client
```

## 快速开始

### 基础使用

```typescript
import { Client } from "jsr:@dreamer/socket.io/client";

// 创建客户端
const client = new Client({
  url: "http://localhost:3000",
  namespace: "/",
});

// 连接成功事件
client.on("connect", () => {
  console.log("已连接，Socket ID:", client.getId());

  // 发送消息
  client.emit("chat-message", {
    text: "Hello, Server!",
  });
});

// 接收消息
client.on("chat-response", (data) => {
  console.log("收到响应:", data);
});

// 断开连接事件
client.on("disconnect", (reason) => {
  console.log("断开连接:", reason);
});

// 连接错误事件
client.on("connect_error", (error) => {
  console.error("连接错误:", error);
});
```

### 带确认的事件

```typescript
client.emit("chat-message", { text: "Hello" }, (response) => {
  console.log("服务器确认:", response);
});
```

### 自定义重连策略

```typescript
const client = new Client({
  url: "http://localhost:3000",
  autoReconnect: true,
  reconnectionDelay: 1000, // 初始重连延迟 1 秒
  reconnectionDelayMax: 5000, // 最大重连延迟 5 秒
  reconnectionAttempts: 10, // 最多重连 10 次
});
```

### 指定传输方式

```typescript
const client = new Client({
  url: "http://localhost:3000",
  transports: ["websocket", "polling"], // 优先使用 WebSocket，失败后降级到轮询
});
```

### 使用命名空间

```typescript
// 连接到聊天命名空间
const chatClient = new Client({
  url: "http://localhost:3000",
  namespace: "/chat",
});

chatClient.on("connect", () => {
  chatClient.emit("chat-message", { text: "Hello" });
});
```

### 一次性事件监听

```typescript
// 只监听一次连接事件
client.once("connect", () => {
  console.log("首次连接成功");
});

// 只监听一次自定义事件
client.once("welcome-message", (data) => {
  console.log("收到欢迎消息:", data);
});
```

### 移除事件监听器

```typescript
// 移除特定事件的所有监听器
client.removeAllListeners("chat-message");

// 移除所有事件的所有监听器
client.removeAllListeners();
```

## API 文档

### Client

Socket.IO 客户端类。

**构造函数**：

```typescript
new Client(options: ClientOptions)
```

**选项**：

- `url: string`: 服务器 URL（必需）
- `namespace?: string`: 命名空间（默认："/"）
- `query?: Record<string, string>`: 查询参数
- `autoConnect?: boolean`: 是否自动连接（默认：true）
- `autoReconnect?: boolean`: 是否自动重连（默认：true）
- `reconnectionDelay?: number`: 重连延迟（默认：1000ms）
- `reconnectionDelayMax?: number`: 最大重连延迟（默认：5000ms）
- `reconnectionAttempts?: number`: 重连尝试次数（默认：Infinity）
- `transports?: TransportType[]`: 允许的传输方式（默认：["websocket",
  "polling"]）
- `timeout?: number`: 超时时间（默认：20000ms）

**方法**：

- `connect(): Promise<void>`: 连接到服务器
- `disconnect(): void`: 断开连接
- `emit(event: string, data?: any, callback?: Function): void`: 发送事件
- `on(event: string, listener: ClientEventListener): void`: 监听事件
- `off(event: string, listener?: ClientEventListener): void`: 移除监听器
- `once(event: string, listener: ClientEventListener): void`: 只监听一次事件
- `removeAllListeners(event?: string): this`:
  移除所有事件监听器（或指定事件的监听器）
- `getId(): string`: 获取 Socket ID
- `isConnected(): boolean`: 检查是否已连接

**事件**：

- `connect`: 连接成功
- `disconnect`: 断开连接
- `connect_error`: 连接错误
- `reconnect_failed`: 重连失败
- `message`: 收到消息（通用事件）
- 自定义事件：通过 `emit` 发送的自定义事件

## 注意事项

- 客户端主要用于浏览器环境
- 支持自动降级：如果 WebSocket 不可用，自动降级到 HTTP 长轮询
- 支持自动重连：连接断开后自动尝试重连
- 事件确认：支持服务器对客户端事件的确认响应
