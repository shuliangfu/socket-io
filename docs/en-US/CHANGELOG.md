# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.12] - 2026-02-20

### Fixed

- **Client**: In `Client.connect()`, after `await this.transport.connect(url)`,
  if `disconnect()` was called during the await (e.g. component unmount or
  effect cleanup), `this.transport` could be set to `null`. The code then
  created `ClientSocket` with a null transport, causing
  `TypeError: Cannot read
  properties of null (reading 'on')`. A guard now
  returns early when `this.transport === null` after the await, avoiding the
  crash.

---

## [1.0.11] - 2026-02-20

### Changed

- **Encryption**: Client and server encryption managers now import
  `decrypt`/`encrypt` from `@dreamer/crypto/client` instead of
  `@dreamer/crypto`, so client bundles no longer pull in i18n/locales and avoid
  browser parse errors.

---

## [1.0.10] - 2026-02-20

### Changed

- **Dependencies**: Bumped @dreamer/crypto to ^1.0.2.

---

## [1.0.9] - 2026-02-20

### Changed

- **Client self-contained**: The client package no longer imports from root
  `../types.ts`. All client types (`SocketData`, `SocketEventListener`,
  `EncryptionConfig`, `TransportType`, `ClientOptions`, `ClientEventListener`)
  are now defined in `src/client/types.ts`. `client/encryption-manager.ts`,
  `client/mod.ts`, and `client/socket.ts` import from `./types.ts` only, so the
  client subtree has no dependency on server or root types and is safe for
  bundling as a separate entry.

---

## [1.0.8] - 2026-02-19

### Changed

- **i18n**: i18n now initializes automatically when the i18n module is loaded;
  `initSocketIoI18n` is no longer exported. Removed explicit
  `initSocketIoI18n()` call from `mod.ts`. `$tr` still ensures init when called.
- **Dependencies**: Bumped @dreamer/runtime-adapter to ^1.0.15, @dreamer/test to
  ^1.0.11, @dreamer/crypto to ^1.0.1.

---

## [1.0.7] - 2026-02-19

### Changed

- **i18n**: Renamed translation method from `$t` to `$tr` to avoid conflict with
  global `$t`. Update existing code to use `$tr` for package messages.

### Fixed

- **i18n**: `$tr` now lazily initializes i18n on first use so log messages are
  translated (not raw keys) when `initSocketIoI18n()` was not called (e.g. in
  tests). Tests updated to use `$tr` instead of `$t`.

---

## [1.0.6] - 2026-02-18

### Removed

- **`tr` method and all references**: Server no longer exposes `tr()`. Engine,
  socketio (namespace, message-queue, socket), and compression use package `$t`
  from `i18n.ts` only. No `tr` or `lang` passed to constructors; locale is set
  once at Server construction via `setSocketIoLocale(options.lang)`.

### Changed

- **Server**: Replaced all `this.tr(...)` with
  `$t(key, params, this.options.lang)`. Removed `tr` from BatchHeartbeatManager,
  CompressionManager, EngineSocket, PollingTransport, WebSocketTransport,
  Namespace MessageQueue options.
- **Engine**: heartbeat-manager, transport, socket, websocket-transport,
  websocket-batch-sender use `$t(key)` (no lang param). WebSocketBatchSender
  keeps `setLang()` for optional override; transport constructors no longer take
  `lang`.
- **SocketIO**: namespace creates MessageQueue with `{ logger }` only; socket
  and message-queue call `$t(...)` directly.
- **Tests**: logger-debug-i18n uses `$t`; optimization-new MessageQueue/Server
  lang/WebSocketBatchSender tests updated (setTr → setLang, MessageQueue without
  tr).

---

## [1.0.5] - 2026-02-18

### Fixed

- **Client bundle (esbuild)**: Resolved "No matching export for EnginePacketType
  / SocketIOPacketType" when bundling the client. Root cause was a circular
  dependency: `types.ts` → `socketio/socket.ts` → `types.ts`, so protocol
  exports were not yet available when the resolver loaded `types.ts`. Client
  code now imports protocol types from a dedicated `src/client/types.ts` (no
  package-internal imports), and other types from `../types.ts`; the main
  `types.ts` no longer depends on `socketio/socket.ts`.

### Changed

- **Client**: Added `src/client/types.ts` with `EnginePacketType`,
  `SocketIOPacketType`, `EnginePacket`, and `SocketIOPacket`. All client modules
  import these from `./types.ts` instead of `../types.ts`.
- **Types**: Main `types.ts` keeps the same protocol type definitions for
  server/adapters; introduced `ServerSocketLike` and removed the import of
  `SocketIOSocket` to break the cycle. `ConnectionEventListener` (connection
  callback type using `SocketIOSocket`) is now defined and exported from
  `socketio/namespace.ts`; `Server` and `Namespace` use it for the
  `"connection"` event.
- **Adapters**: `SocketIOAdapter.init()` now uses `AdapterSocketLike` instead of
  `SocketIOSocket` in the type signature; concrete adapters (memory, redis,
  mongodb) cast internally. This avoids adapters depending on `socketio/socket`
  and keeps the dependency graph acyclic.

### Added

- **Exports**: Optional subpath `./client/types` in `deno.json` for direct
  import of client protocol types (e.g.
  `import ... from
  "jsr:@dreamer/socket-io/client/types"`). Not required for
  client bundling.

---

## [1.0.4] - 2026-02-18

### Changed

- **License**: License changed to Apache 2.0.
- **ServerOptions**: Replaced optional `t?(key, params)` with
  `lang?: "en-US" |
  "zh-CN"`. Server now uses built-in i18n; set `lang` in
  constructor to fix locale, or leave unset for env-based detection (LANGUAGE /
  LC_ALL / LANG).
- **Client**: Client imports refactored to use local modules
  (`./encryption-manager.ts`, `./engine-parser.ts`, `./socketio-parser.ts`) so
  bundlers can build client-only code without pulling server paths.

### Added

- **i18n (source)**: Server integrates `@dreamer/i18n`. Entry calls
  `initSocketIoI18n()` to load en-US/zh-CN; log and error messages use `$t()`.
  EncryptionManager, engine/parser, socketio/parser, stream-parser, and
  hardware-accel error/warning strings are now i18n keys (e.g.
  `errors.encryptFailed`, `warnings.wasmUnavailable`). `Server#tr()` uses
  built-in `$t()`.
- **i18n translations (docs)**: Full English and Chinese (en-US / zh-CN)
  translations for README, CHANGELOG, TEST_REPORT, and client README
  (docs/en-US, docs/zh-CN). Root README simplified; client README moved from src
  to docs.

### Updated

- **Test report**: Test report updated; 203 tests passed (Deno and Bun). Both
  en-US and zh-CN TEST_REPORT.md are kept in sync.

---

## [1.0.3] - 2026-02-07

### Added

- **Exports**: Added `./types` export mapping to `./src/types.ts` for direct
  import of `EnginePacketType` and `SocketIOPacketType`. Fixes esbuild resolver
  failing to resolve relative path imports within JSR package when bundling
  client code (e.g. `../types.ts` from client modules).

---

## [1.0.2] - 2026-02-07

### Fixed

- **CompressionManager**: Fixed TypeScript error
  `TS2315: Type 'Uint8Array' is not generic` when passing buffer to
  `WritableStreamDefaultWriter.write()`. Replaced invalid
  `Uint8Array<ArrayBuffer>` assertion with `BufferSource` for cross-environment
  compatibility (Deno/Bun, strict type check).

---

## [1.0.1] - 2026-02-07

### Fixed

#### Client: Intentional disconnect no longer triggers auto-reconnect

- **Problem**: When the user explicitly called `client.disconnect()` (e.g., in a
  React/Preact `useEffect` cleanup when navigating away from a page), the
  Client's internal `disconnect` event handler would still trigger
  `scheduleReconnect()` because `autoReconnect` was enabled. This caused:
  - Orphaned reconnection attempts after the component unmounted
  - Multiple concurrent Socket.IO connections when switching pages repeatedly
    (SPA/client-side navigation)
  - Excessive polling requests in the Network tab (e.g., multiple
    `socket.io/?transport=polling` requests with the same or different session
    IDs)
- **Solution**: Added an `intentionalDisconnect` flag. When `disconnect()` is
  called, the flag is set to `true` before disconnecting. The `disconnect` event
  handler now checks this flag and skips `scheduleReconnect()` when the user
  intentionally disconnected. The flag is reset to `false` when `connect()` is
  called again (e.g., if the user manually reconnects later).
- **Impact**: Users who create the Client in a page component and call
  `disconnect()` in the cleanup (e.g., `useEffect` return) will no longer see
  duplicate connections or excessive requests when navigating between pages.
  Reconnection after network failures or server restarts continues to work as
  expected.

---

## [1.0.0] - 2026-02-06

### Added

First stable release. Full Socket.IO implementation with server and client
support, compatible with Deno and Bun. Real-time bidirectional communication,
room management, namespaces, message encryption, and distributed adapters.

#### Core

- **Server**: Full Socket.IO server with Engine.IO and Socket.IO protocol
  support
- **Client**: Browser client via `jsr:@dreamer/socket.io/client` with
  auto-connect and auto-reconnect
- **Transports**: WebSocket (primary), HTTP long polling (fallback), smart
  upgrade/downgrade
- **Protocol**: Engine.IO and Socket.IO handshake, heartbeat, packets, events,
  acknowledgments, binary support
- **Cross-runtime**: Deno 2.6+ and Bun 1.3.5+, unified API via
  @dreamer/runtime-adapter

#### Rooms & Namespaces

- **Rooms**: Dynamic create/destroy, join/leave, broadcast (with exclude), O(1)
  indexing
- **Namespaces**: Multiple namespaces, isolated per namespace, default "/"
- **Events**: connect, disconnect, error, custom events, acknowledgments,
  once(), removeAllListeners()

#### Adapters (Distributed)

- **MemoryAdapter**: Default in-memory adapter
- **RedisAdapter**: Redis Pub/Sub for cross-server sync
- **MongoDBAdapter**: MongoDB Change Streams for cross-server sync
- **Extensible interface**: Custom adapter support

#### Performance

- **Compression**: gzip/deflate, auto compress large messages
- **Streaming**: Chunked large packets, incremental parsing, max size limit
- **Hardware acceleration**: WebAssembly, SIMD, batch hash, batch data ops
- **Cache**: LRU serialization cache, parser cache, encryption cache

#### Security

- **Encryption**: AES-256-GCM, AES-128-GCM, auto encrypt/decrypt MESSAGE packets
  via EncryptionManager

#### Client Features

- **Auto connect / auto reconnect**: Smart reconnection with message queue
- **Connection status**: getId(), isConnected()
- **Message queue**: Offline message queuing

#### Exports

- **Server**: Server, Namespace, SocketIOSocket
- **Engine.IO**: PollingTransport, WebSocketTransport, EngineSocket, Transport,
  BatchHeartbeatManager, PollingBatchHandler, AdaptivePollingTimeout,
  WebSocketBatchSender
- **Client**: Client (via `jsr:@dreamer/socket.io/client`), ClientMessageQueue,
  SmartReconnection
- **Adapters**: MemoryAdapter, RedisAdapter, MongoDBAdapter
- **Utilities**: CompressionManager, EncryptionManager, StreamParser,
  HardwareAccelerator
- **Protocol**: decodeEnginePacket, encodeEnginePacket, decodeSocketIOPacket,
  encodeSocketIOPacket
- **Types**: ServerOptions, ClientOptions, Handshake, Middleware, SocketData,
  TransportType, etc.
