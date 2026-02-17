/**
 * @module @dreamer/socket.io
 *
 * Socket.IO 库，提供实时双向通信功能，兼容 Deno 和 Bun 运行时。
 *
 * 功能特性：
 * - Socket.IO 服务器：基于 Engine.IO 和 Socket.IO 协议的服务器实现
 * - 多种传输方式：支持 WebSocket 和 HTTP 长轮询，自动降级
 * - 命名空间：支持命名空间隔离不同业务场景
 * - 房间管理：房间创建、用户加入/离开、房间内消息广播
 * - 事件系统：连接事件、消息事件、自定义事件支持
 * - 自动重连：客户端支持自动重连机制
 *
 * @example
 * ```typescript
 * import { Server } from "jsr:@dreamer/socket.io";
 *
 * const io = new Server({
 *   port: 3000,
 *   path: "/socket.io/",
 * });
 *
 * io.on("connection", (socket) => {
 *   socket.on("chat-message", (data) => {
 *     socket.emit("chat-response", { status: "success" });
 *   });
 * });
 *
 * await io.listen();
 * ```
 */

// 服务端 i18n：入口加载文案并设置 locale（仅服务端）
import { initSocketIoI18n } from "./i18n.ts";
initSocketIoI18n();

// 导出类型
export type {
  ClientEventListener,
  ClientOptions,
  Handshake,
  Middleware,
  ServerEventListener,
  ServerOptions,
  SocketData,
  SocketEventListener,
  TransportType,
} from "./types.ts";

// 导出主要类
export { Server } from "./server.ts";
export { Namespace } from "./socketio/namespace.ts";
export { SocketIOSocket } from "./socketio/socket.ts";
export { MessageCache } from "./socketio/message-cache.ts";
export { SocketPool } from "./socketio/socket-pool.ts";
export { MessageQueue } from "./socketio/message-queue.ts";
export { ParserCache } from "./socketio/parser-cache.ts";

// 导出 Engine.IO 相关
export { PollingTransport } from "./engine/polling-transport.ts";
export { EngineSocket } from "./engine/socket.ts";
export { Transport } from "./engine/transport.ts";
export { WebSocketTransport } from "./engine/websocket-transport.ts";
export { BatchHeartbeatManager } from "./engine/heartbeat-manager.ts";
export { PollingBatchHandler } from "./engine/polling-batch-handler.ts";
export { AdaptivePollingTimeout } from "./engine/adaptive-polling-timeout.ts";
export { WebSocketBatchSender } from "./engine/websocket-batch-sender.ts";
export { ClientMessageQueue } from "./client/message-queue.ts";
export { SmartReconnection } from "./client/smart-reconnection.ts";

// 导出压缩相关
export { CompressionManager } from "./compression/compression-manager.ts";
export type {
  CompressionAlgorithm,
  CompressionManagerOptions,
} from "./compression/compression-manager.ts";

// 导出加密相关
export { EncryptionManager } from "./encryption/encryption-manager.ts";
export type { EncryptionConfig } from "./types.ts";

// 导出流式处理相关
export {
  StreamPacketProcessor,
  StreamParser,
} from "./streaming/stream-parser.ts";

// 导出硬件加速相关
export { HardwareAccelerator } from "./hardware-accel/mod.ts";
export type { AcceleratorOptions } from "./hardware-accel/mod.ts";

// 导出协议解析器
export {
  decodePacket as decodeEnginePacket,
  decodePayload as decodeEnginePayload,
  encodePacket as encodeEnginePacket,
  encodePayload as encodeEnginePayload,
} from "./engine/parser.ts";
export {
  decodePacket as decodeSocketIOPacket,
  encodePacket as encodeSocketIOPacket,
} from "./socketio/parser.ts";

// 导出枚举
export { EnginePacketType, SocketIOPacketType } from "./types.ts";

// 导出客户端（通过 /client 子路径访问）
// 客户端代码在 src/client/mod.ts 中

// 导出适配器
export { MemoryAdapter, MongoDBAdapter, RedisAdapter } from "./adapters/mod.ts";
export type {
  AdapterMessage,
  MongoDBAdapterOptions,
  MongoDBChangeStream,
  MongoDBClient,
  MongoDBCollection,
  MongoDBConnectionConfig,
  MongoDBCursor,
  MongoDBDatabase,
  RedisAdapterOptions,
  RedisClient,
  RedisConnectionConfig,
  RedisPubSubClient,
  SocketIOAdapter,
} from "./adapters/mod.ts";
