/**
 * @fileoverview 客户端用协议类型（Engine.IO / Socket.IO 报文类型与数据包）
 * 仅用于 client 目录，无包内依赖，避免打包时与主 types 循环依赖导致导出解析失败
 */

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
 * Socket 数据存储（客户端 Socket 的 data 字段）
 */
export interface SocketData {
  [key: string]: unknown;
}

/**
 * Socket 事件监听器（客户端 Socket.on 的回调类型）
 * @param data - 事件负载（emit 时传入的 payload）
 * @param callback - 可选 ack 回调
 */
export type SocketEventListener = (
  data?: unknown,
  callback?: (response: unknown) => void,
) => void;

/**
 * 加密配置（仅客户端使用，与根 types 解耦）
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
 * 传输方式类型
 */
export type TransportType = "websocket" | "polling";

/**
 * 客户端配置选项（仅客户端使用，与根 types 解耦）
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
 * 客户端事件监听器（Client.on 的回调类型）
 */
export type ClientEventListener = (data?: unknown) => void;
