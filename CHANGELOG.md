# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] - 2026-02-06

### Added

First stable release. Full Socket.IO implementation with server and client support, compatible with Deno and Bun. Real-time bidirectional communication, room management, namespaces, message encryption, and distributed adapters.

#### Core

- **Server**: Full Socket.IO server with Engine.IO and Socket.IO protocol support
- **Client**: Browser client via `jsr:@dreamer/socket.io/client` with auto-connect and auto-reconnect
- **Transports**: WebSocket (primary), HTTP long polling (fallback), smart upgrade/downgrade
- **Protocol**: Engine.IO and Socket.IO handshake, heartbeat, packets, events, acknowledgments, binary support
- **Cross-runtime**: Deno 2.6+ and Bun 1.3.5+, unified API via @dreamer/runtime-adapter

#### Rooms & Namespaces

- **Rooms**: Dynamic create/destroy, join/leave, broadcast (with exclude), O(1) indexing
- **Namespaces**: Multiple namespaces, isolated per namespace, default "/"
- **Events**: connect, disconnect, error, custom events, acknowledgments, once(), removeAllListeners()

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

- **Encryption**: AES-256-GCM, AES-128-GCM, auto encrypt/decrypt MESSAGE packets via EncryptionManager

#### Client Features

- **Auto connect / auto reconnect**: Smart reconnection with message queue
- **Connection status**: getId(), isConnected()
- **Message queue**: Offline message queuing

#### Exports

- **Server**: Server, Namespace, SocketIOSocket
- **Engine.IO**: PollingTransport, WebSocketTransport, EngineSocket, Transport, BatchHeartbeatManager, PollingBatchHandler, AdaptivePollingTimeout, WebSocketBatchSender
- **Client**: Client (via `jsr:@dreamer/socket.io/client`), ClientMessageQueue, SmartReconnection
- **Adapters**: MemoryAdapter, RedisAdapter, MongoDBAdapter
- **Utilities**: CompressionManager, EncryptionManager, StreamParser, HardwareAccelerator
- **Protocol**: decodeEnginePacket, encodeEnginePacket, decodeSocketIOPacket, encodeSocketIOPacket
- **Types**: ServerOptions, ClientOptions, Handshake, Middleware, SocketData, TransportType, etc.
