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
