# @dreamer/socket.io

> High-performance, cross-runtime Socket.IO implementation compatible with Deno
> and Bun. Full real-time bidirectional communication.

[English](./README.md) | [中文 (Chinese)](../zh-CN/README.md)

[![JSR](https://jsr.io/badges/@dreamer/socket.io)](https://jsr.io/@dreamer/socket.io)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-203%20passed-brightgreen)](./TEST_REPORT.md)

---

## 🎯 Features

`@dreamer/socket.io` is a full Socket.IO implementation with server and client
support: real-time bidirectional communication, room management, namespace
isolation, message encryption. Suitable for chat apps, collaboration tools, push
services, multiplayer games, IoT.

---

## ✨ Highlights

### Core

- **Cross-runtime**: Deno 2.6+ and Bun 1.3.5+, no Node.js. Unified API via
  @dreamer/runtime-adapter
- **Transports**: WebSocket (primary), HTTP long polling (fallback), smart
  upgrade/downgrade
- **Protocol**: Full Engine.IO and Socket.IO (handshake, heartbeat, packets,
  events, acks), binary support, parser cache

### Advanced

- **Rooms**: Dynamic create/destroy, join/leave, broadcast (with exclude), O(1)
  indexing
- **Namespaces**: Multiple namespaces, isolated per namespace, default "/"
- **Events**: connect, disconnect, error, custom events, acknowledgments,
  once(), removeAllListeners()
- **Client**: Auto connect, auto reconnect, message queue, connection status

### Performance

- **Compression**: gzip/deflate, auto compress large messages
- **Streaming**: Chunked large packets, incremental parsing, max size limit
- **Hardware**: WebAssembly, SIMD, batch hash, batch data ops
- **Cache**: LRU serialization cache, parser cache, encryption cache

### Security

- **Encryption**: AES-256-GCM, AES-128-GCM, auto encrypt/decrypt MESSAGE packets

### Distributed

- **Adapters**: Memory (default), Redis (Pub/Sub), MongoDB (Change Streams).
  Extensible interface.
- **Cross-server**: Room sync, broadcast, heartbeat

---

## 🎨 Design

- **Main package**: Server (Deno/Bun)
- **Client subpackage**: Browser (`jsr:@dreamer/socket.io/client`)

---

## 🎯 Use Cases

- Real-time chat, notifications, push
- Collaboration, multiplayer games
- Monitoring, logs, metrics
- IoT, device control

---

## 📦 Installation

### Deno

```bash
deno add jsr:@dreamer/socket.io
```

### Bun

```bash
bunx jsr add @dreamer/socket.io
```

---

## 🌍 Compatibility

| Environment      | Version | Status                                         |
| ---------------- | ------- | ---------------------------------------------- |
| **Deno**         | 2.6+    | ✅ Fully supported                             |
| **Bun**          | 1.3.5+  | ✅ Fully supported                             |
| **Server**       | -       | ✅ Deno/Bun                                    |
| **Client**       | -       | ✅ Browser via `jsr:@dreamer/socket.io/client` |
| **Dependencies** | -       | 📦 @dreamer/runtime-adapter                    |

---

## 🚀 Quick Start

### Basic Server

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("chat-message", (data) => {
    console.log("Chat message:", data);
    socket.emit("chat-response", {
      status: "success",
      message: "Message received",
    });
  });

  socket.on("disconnect", (reason) => {
    console.log("Disconnected:", socket.id, reason);
  });
});

await io.listen();
console.log("Socket.IO server running at http://localhost:3000");
```

### Basic Client (Browser)

```typescript
import { Client } from "jsr:@dreamer/socket.io/client";

const client = new Client({
  url: "http://localhost:3000",
  namespace: "/",
  autoConnect: true,
  autoReconnect: true,
});

client.on("connect", () => {
  console.log("Connected, Socket ID:", client.getId());
  client.emit("chat-message", { text: "Hello!" });
});

client.on("chat-response", (data) => {
  console.log("Response:", data);
});

client.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});
```

### Room Management

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({ port: 3000, path: "/socket.io/" });

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    io.of("/").to(roomId).emit("user-joined", { userId: socket.id });
  });

  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    io.of("/").to(roomId).emit("user-left", { userId: socket.id });
  });

  socket.on("room-message", (data) => {
    const { roomId, message } = data;
    io.of("/").to(roomId).emit("room-message", {
      userId: socket.id,
      message,
    });
  });
});

await io.listen();
```

### Namespaces

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({ port: 3000, path: "/socket.io/" });

io.on("connection", (socket) => {
  socket.on("message", (data) => {
    socket.emit("response", { message: "From default namespace" });
  });
});

const chatNamespace = io.of("/chat");
chatNamespace.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    chatNamespace.emit("chat-message", {
      userId: socket.id,
      message: data.message,
    });
  });
});

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

### Server-Level Events

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({ port: 3000, path: "/socket.io/" });
await io.listen();

io.emit("server-announcement", { message: "Server maintenance" });
io.to("room-123").emit("room-notification", { message: "Room notification" });
io.except("socket-id-456").emit("broadcast-message", { message: "Broadcast" });

const allSocketIds = await io.allSockets();
console.log(`Connected: ${allSocketIds.size}`);

await io.socketsJoin("room-123");
await io.socketsLeave("room-123");
await io.disconnectSockets();
```

### Socket Advanced

```typescript
io.on("connection", (socket) => {
  socket.once("welcome", (data) => {
    console.log("Welcome (once):", data);
  });

  socket.to("room-123").emit("room-message", { text: "Hello" });
  socket.broadcast.emit("user-joined", { userId: socket.id });
  socket.to("room-123").except("socket-id-456").emit("message", data);

  socket.compress(true).emit("large-data", largeObject);

  const rooms = socket.rooms;
  console.log(`Socket ${socket.id} in ${rooms.size} rooms`);

  socket.on("cleanup", () => {
    socket.removeAllListeners("chat-message");
  });
});
```

### Namespace Batch Operations

```typescript
const chatNamespace = io.of("/chat");
await chatNamespace.socketsJoin("general-room");
await chatNamespace.socketsLeave("general-room");

const sockets = await chatNamespace.fetchSockets();
console.log(`Namespace has ${sockets.length} Sockets`);

await chatNamespace.disconnectSockets();
```

### Distributed (Redis Adapter)

```typescript
import { Server } from "jsr:@dreamer/socket.io";
import { RedisAdapter } from "jsr:@dreamer/socket.io/adapters";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
  adapter: new RedisAdapter({
    connection: { host: "127.0.0.1", port: 6379 },
    keyPrefix: "socket.io",
    heartbeatInterval: 30,
  }),
});

io.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    socket.to("chat-room").emit("chat-message", data);
  });
});

await io.listen();
```

**Note**: Install `redis` package: `deno add npm:redis`

### Debug & Logging (debug / logger / lang)

Pass **debug**, **logger**, and **lang** for connection debugging and log i18n:

```typescript
import { createLogger } from "jsr:@dreamer/logger";
import { Server } from "jsr:@dreamer/socket.io";

const logger = createLogger({ level: "debug", format: "text" });

const io = new Server({
  port: 3000,
  path: "/socket.io/",
  debug: true,
  logger,
  lang: "en-US", // or "zh-CN"; omit to auto-detect from LANGUAGE/LC_ALL/LANG
});
```

Log and error messages use built-in i18n (en-US / zh-CN). Set **lang** in
constructor to fix the language; otherwise it is detected from environment
variables.

### Distributed (MongoDB Adapter)

```typescript
import { Server } from "jsr:@dreamer/socket.io";
import { MongoDBAdapter } from "jsr:@dreamer/socket.io/adapters";

const io = new Server({
  port: 3000,
  path: "/socket.io/",
  adapter: new MongoDBAdapter({
    connection: {
      host: "127.0.0.1",
      port: 27017,
      database: "socket_io",
      // replicaSet: "rs0", // for Change Streams (recommended)
    },
    keyPrefix: "socket.io",
    heartbeatInterval: 30,
  }),
});

io.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    socket.to("chat-room").emit("chat-message", data);
  });
});

await io.listen();
```

**Note**: Install `mongodb` package: `deno add npm:mongodb`

**MongoDB modes**:

- **Replica set**: Change Streams (recommended)
- **Standalone**: Polling (500ms fallback)

---

## 📚 API

### Server

| Option                 | Type                 | Default                    | Description              |
| ---------------------- | -------------------- | -------------------------- | ------------------------ |
| `host`                 | `string`             | `"0.0.0.0"`                | Host                     |
| `port`                 | `number`             | `3000`                     | Port                     |
| `path`                 | `string`             | `"/socket.io/"`            | Path                     |
| `transports`           | `TransportType[]`    | `["websocket", "polling"]` | Allowed transports       |
| `pingTimeout`          | `number`             | `20000`                    | Ping timeout (ms)        |
| `pingInterval`         | `number`             | `25000`                    | Ping interval (ms)       |
| `allowPolling`         | `boolean`            | `true`                     | Allow polling            |
| `pollingTimeout`       | `number`             | `60000`                    | Polling timeout (ms)     |
| `allowCORS`            | `boolean`            | `true`                     | CORS                     |
| `maxConnections`       | `number`             | -                          | Max connections          |
| `connectTimeout`       | `number`             | `45000`                    | Connect timeout (ms)     |
| `compression`          | `boolean`            | `false`                    | Compression              |
| `streaming`            | `boolean`            | `false`                    | Streaming                |
| `maxPacketSize`        | `number`             | `10 * 1024 * 1024`         | Max packet size (10MB)   |
| `hardwareAcceleration` | `boolean`            | `false`                    | Hardware acceleration    |
| `adapter`              | `SocketIOAdapter`    | Memory                     | Adapter                  |
| `encryption`           | `EncryptionConfig`   | -                          | Encryption               |
| `debug`                | `boolean`            | `false`                    | Debug                    |
| `logger`               | `Logger`             | -                          | Logger                   |
| `lang`                 | `"en-US" \| "zh-CN"` | env detect                 | Language for logs/errors |

**Methods**: `listen`, `close`, `on`, `of`, `emit`, `to`, `in`, `except`,
`allSockets`, `fetchSockets`, `socketsJoin`, `socketsLeave`,
`disconnectSockets`, `serverSideEmit`

### Socket

**Methods**: `emit`, `on`, `off`, `once`, `removeAllListeners`, `join`, `leave`,
`to`, `in`, `except`, `broadcast`, `compress`, `getRooms`, `getServer`,
`disconnect`

**Properties**: `id`, `nsp`, `handshake`, `data`, `connected`, `rooms`

### Client

**Options**: `url`, `namespace`, `query`, `autoConnect`, `autoReconnect`,
`reconnectionDelay`, `reconnectionDelayMax`, `reconnectionAttempts`,
`transports`, `forceNew`, `timeout`, `encryption`

**Methods**: `connect`, `disconnect`, `getId`, `emit`, `on`, `off`, `once`

**Events**: `connect`, `disconnect`, `connect_error`, `reconnecting`,
`reconnect_failed`, `message`, custom

### Namespace

**Methods**: `on`, `emit`, `to`, `in`, `except`, `getSocket`, `getSockets`,
`socketsJoin`, `socketsLeave`, `fetchSockets`, `disconnectSockets`

### Adapters

- **RedisAdapter**: `connection`, `client`, `pubsubConnection`, `pubsubClient`,
  `keyPrefix`, `heartbeatInterval`
- **MongoDBAdapter**: `connection`, `keyPrefix`, `heartbeatInterval`
- **EncryptionConfig**: `key`, `algorithm`, `enabled`, `cacheSize`, `cacheTTL`

---

## 📝 Notes

- Server and client separation via `/client` subpath
- Unified API for server and client
- Auto fallback to HTTP long polling when WebSocket unavailable
- Full TypeScript types

---

## 📊 Test Report

See [TEST_REPORT.md](./TEST_REPORT.md) (English) ·
[中文测试报告](../zh-CN/TEST_REPORT.md)

- **Total**: 203
- **Pass rate**: 100%
- **Execution time**: Deno ~44–45s / Bun ~38s
- **Coverage**: Core, edge cases, integration, optimization (i18n, generics,
  cleanup)

---

## 📋 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for full history.

**Latest (v1.0.5 - 2026-02-18)**: **Fixed**: Client bundle (esbuild) "No
matching export for EnginePacketType/SocketIOPacketType" by adding
`src/client/types.ts` and breaking circular dependency. **Changed**: Client
imports protocol types from `./types.ts`; main `types.ts` uses
`ServerSocketLike`/`AdapterSocketLike`; `ConnectionEventListener` from
namespace. **Added**: Export `./client/types`.

---

## 🤝 Contributing

Issues and Pull Requests welcome!

---

## 📄 License

Apache License 2.0 - see [LICENSE](../../LICENSE)

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
