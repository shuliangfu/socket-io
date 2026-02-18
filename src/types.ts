import type { Logger } from "@dreamer/logger";
import type { SocketIOAdapter } from "./adapters/types.ts";

/**
 * @fileoverview Socket.IO 类型定义
 * 定义 Socket.IO 服务器和客户端相关的类型和接口
 */

/**
 * 加密配置
 */
export interface EncryptionConfig {
  /** 加密密钥（Uint8Array 或字符串） */
  key: Uint8Array | string;
  /** 加密算法（默认：根据密钥长度自动选择） */
  algorithm?: "aes-256-gcm" | "aes-128-gcm" | "aes-256-cbc" | "aes-128-cbc";
  /** 是否启用加密（默认：true） */
  enabled?: boolean;
  /** 加密缓存大小（默认：1000） */
  cacheSize?: number;
  /** 缓存过期时间（毫秒，默认：60000） */
  cacheTTL?: number;
}

/**
 * Socket.IO 服务器配置选项
 * @dreamer/logger Logger 实例（可选，用于统一日志输出；未提供时创建默认 logger）
 */
export interface ServerOptions {
  /** 主机地址（默认：0.0.0.0） */
  host?: string;
  /** Logger 实例（可选，用于统一日志输出；未提供时创建默认 logger） */
  logger?: Logger;
  /** 端口号 */
  port?: number;
  /** Socket.IO 路径（默认："/socket.io/"） */
  path?: string;
  /** 允许的传输方式（默认：["websocket", "polling"]） */
  transports?: TransportType[];
  /** 是否允许跨域（默认：true） */
  allowCORS?: boolean;
  /** CORS 来源（默认：*） */
  cors?: {
    origin?: string | string[] | ((origin: string) => boolean);
    methods?: string[];
    credentials?: boolean;
  };
  /** 心跳超时时间（毫秒，默认：20000） */
  pingTimeout?: number;
  /** 心跳间隔（毫秒，默认：25000） */
  pingInterval?: number;
  /** 最大连接数（默认：无限制） */
  maxConnections?: number;
  /** 连接超时时间（毫秒，默认：45000） */
  connectTimeout?: number;
  /** 是否启用压缩（默认：false） */
  compression?: boolean;
  /** 是否启用流式处理（默认：false，用于大数据包） */
  streaming?: boolean;
  /** 最大数据包大小（字节，默认：10MB） */
  maxPacketSize?: number;
  /** 是否启用硬件加速（默认：false） */
  hardwareAcceleration?: boolean;
  /** 是否启用 HTTP 长轮询（默认：true） */
  allowPolling?: boolean;
  /** 轮询超时时间（毫秒，默认：60000） */
  pollingTimeout?: number;
  /** 是否启用调试日志（默认：false），开启后会在控制台输出请求路径、握手等调试信息 */
  debug?: boolean;
  /** 语言（可选），用于日志与错误文案；未传时由环境变量 LANGUAGE/LC_ALL/LANG 检测 */
  lang?: "en-US" | "zh-CN";
  /** 分布式适配器（可选，用于多服务器部署） */
  adapter?: SocketIOAdapter;
  /** 加密配置（可选，用于消息加密） */
  encryption?: EncryptionConfig;
}

/**
 * 传输方式类型
 */
export type TransportType = "websocket" | "polling";

/**
 * Engine.IO 消息类型
 */
export enum EnginePacketType {
  OPEN = 0, // 握手
  CLOSE = 1, // 关闭
  PING = 2, // 心跳
  PONG = 3, // 心跳响应
  MESSAGE = 4, // 消息
  UPGRADE = 5, // 升级传输
  NOOP = 6, // 空操作
}

/**
 * Socket.IO 消息类型
 */
export enum SocketIOPacketType {
  CONNECT = 0, // 连接
  DISCONNECT = 1, // 断开
  EVENT = 2, // 事件
  ACK = 3, // 确认
  CONNECT_ERROR = 4, // 连接错误
  BINARY_EVENT = 5, // 二进制事件
  BINARY_ACK = 6, // 二进制确认
}

/**
 * Engine.IO 数据包
 */
export interface EnginePacket {
  /** 数据包类型 */
  type: EnginePacketType;
  /** 数据内容 */
  data?: string | Uint8Array;
}

/**
 * Socket.IO 数据包
 */
export interface SocketIOPacket {
  /** 数据包类型 */
  type: SocketIOPacketType;
  /** 命名空间（可选） */
  nsp?: string;
  /** 数据内容（协议层，可为字符串或结构化数据） */
  data?: unknown;
  /** 确认 ID（可选） */
  id?: number;
  /** 附件数量（二进制数据） */
  attachments?: number;
}

/**
 * 握手信息
 */
export interface Handshake {
  /** 查询参数 */
  query: Record<string, string>;
  /** 请求头 */
  headers: Headers;
  /** 客户端地址 */
  address?: string;
  /** URL */
  url: string;
  /** 传输方式 */
  transport?: TransportType;
}

/**
 * Socket 数据存储
 */
export interface SocketData {
  [key: string]: unknown;
}

/**
 * Socket 事件监听器
 */
export type SocketEventListener = (
  data?: unknown,
  callback?: (response: unknown) => void,
) => void;

/**
 * 带泛型的 Socket 事件监听器（用于类型推断）
 */
export type SocketEventListenerWithData<T = unknown> = (
  data?: T,
  callback?: (response: unknown) => void,
) => void;

/**
 * 服务端 Socket 类型占位（避免 types.ts 依赖 socketio/socket 产生循环依赖，供 ServerEventListener/Middleware 使用）
 * 仅保留可选 id，使 SocketIOSocket 可赋值给本类型
 */
export interface ServerSocketLike {
  id?: string;
}

/**
 * 服务器事件监听器
 */
export type ServerEventListener = (socket: ServerSocketLike) => void;

/**
 * 中间件函数
 */
export type Middleware = (
  socket: ServerSocketLike,
  next: (error?: Error) => void,
) => void | Promise<void>;

/**
 * 客户端配置选项
 */
export interface ClientOptions {
  /** 服务器 URL */
  url: string;
  /** 命名空间（默认："/"） */
  namespace?: string;
  /** 查询参数 */
  query?: Record<string, string>;
  /** 是否自动连接（默认：true） */
  autoConnect?: boolean;
  /** 是否自动重连（默认：true） */
  autoReconnect?: boolean;
  /** 重连延迟（毫秒，默认：1000） */
  reconnectionDelay?: number;
  /** 最大重连延迟（毫秒，默认：5000） */
  reconnectionDelayMax?: number;
  /** 重连尝试次数（默认：Infinity） */
  reconnectionAttempts?: number;
  /** 允许的传输方式（默认：["websocket", "polling"]） */
  transports?: TransportType[];
  /** 是否强制使用轮询（默认：false） */
  forceNew?: boolean;
  /** 超时时间（毫秒，默认：20000） */
  timeout?: number;
  /** 加密配置（可选，用于消息加密） */
  encryption?: EncryptionConfig;
}

/**
 * 客户端事件监听器
 */
export type ClientEventListener = (data?: unknown) => void;
