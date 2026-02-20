# @dreamer/socket.io

> High-performance, cross-runtime Socket.IO implementation compatible with Deno
> and Bun. Full real-time bidirectional communication.

[![JSR](https://jsr.io/badges/@dreamer/socket.io)](https://jsr.io/@dreamer/socket.io)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-203%20passed-brightgreen)](./docs/en-US/TEST_REPORT.md)

**Full docs**: [English](./docs/en-US/README.md) ·
[中文 (Chinese)](./docs/zh-CN/README.md)\
**Changelog**: [EN](./docs/en-US/CHANGELOG.md) |
[中文](./docs/zh-CN/CHANGELOG.md)

**Latest (v1.0.10 - 2026-02-20)**: **Changed** – Bumped @dreamer/crypto to
^1.0.2. [Full changelog](./docs/en-US/CHANGELOG.md).

---

## Features

- **Cross-runtime**: Deno 2.6+ and Bun 1.3.5+, unified API via
  @dreamer/runtime-adapter
- **Transports**: WebSocket (primary), HTTP long polling (fallback)
- **Rooms & namespaces**: Dynamic rooms, multiple namespaces, broadcast with
  exclude
- **Client**: Auto connect/reconnect, message queue, acknowledgments
- **Advanced**: Compression, streaming, encryption, hardware acceleration

## Installation

```bash
deno add jsr:@dreamer/socket.io
# client
deno add jsr:@dreamer/socket.io/client
```

## Quick Start

```typescript
import { Server } from "jsr:@dreamer/socket.io";

const io = new Server({ port: 3000 });
io.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    socket.to("room").emit("chat-message", data);
  });
});
await io.listen();
```

- **Test report**: [en-US](./docs/en-US/TEST_REPORT.md) ·
  [zh-CN](./docs/zh-CN/TEST_REPORT.md)

See [docs/en-US/README.md](./docs/en-US/README.md) or
[docs/zh-CN/README.md](./docs/zh-CN/README.md) for full documentation.
