/**
 * @fileoverview Socket.IO 适配器类型定义
 * 定义分布式适配器接口，用于实现多服务器部署
 */

import type { Logger } from "@dreamer/logger";
import { SocketIOPacket } from "../types.ts";
import { SocketIOSocket } from "../socketio/socket.ts";

/**
 * 消息数据
 */
export interface AdapterMessage {
  /** 事件名称 */
  event?: string;
  /** 事件数据 */
  data?: any;
  /** 房间名称（可选） */
  room?: string;
  /** 命名空间（可选） */
  namespace?: string;
  /** 排除的 Socket ID（可选，用于避免重复发送） */
  excludeSocketId?: string;
  /** Socket.IO 数据包（可选，用于直接发送数据包） */
  packet?: SocketIOPacket;
}

/**
 * Socket.IO 适配器接口
 * 用于实现分布式 Socket.IO 服务器
 */
export interface SocketIOAdapter {
  /**
   * 初始化适配器
   * @param serverId 服务器 ID
   * @param sockets 本地 Socket 映射
   */
  init(serverId: string, sockets: Map<string, SocketIOSocket>): Promise<void> | void;

  /**
   * 关闭适配器
   */
  close(): Promise<void> | void;

  /**
   * 添加 Socket 到房间
   * @param socketId Socket ID
   * @param room 房间名称
   * @param namespace 命名空间（可选）
   */
  addSocketToRoom(
    socketId: string,
    room: string,
    namespace?: string,
  ): Promise<void> | void;

  /**
   * 从房间移除 Socket
   * @param socketId Socket ID
   * @param room 房间名称
   * @param namespace 命名空间（可选）
   */
  removeSocketFromRoom(
    socketId: string,
    room: string,
    namespace?: string,
  ): Promise<void> | void;

  /**
   * 从所有房间移除 Socket
   * @param socketId Socket ID
   * @param namespace 命名空间（可选）
   */
  removeSocketFromAllRooms(
    socketId: string,
    namespace?: string,
  ): Promise<void> | void;

  /**
   * 获取房间内的 Socket ID 列表
   * @param room 房间名称
   * @param namespace 命名空间（可选）
   * @returns Socket ID 列表
   */
  getSocketsInRoom(
    room: string,
    namespace?: string,
  ): Promise<string[]> | string[];

  /**
   * 获取 Socket 所在的房间列表
   * @param socketId Socket ID
   * @param namespace 命名空间（可选）
   * @returns 房间名称列表
   */
  getRoomsForSocket(
    socketId: string,
    namespace?: string,
  ): Promise<string[]> | string[];

  /**
   * 广播消息到所有服务器
   * @param message 消息数据
   */
  broadcast(message: AdapterMessage): Promise<void> | void;

  /**
   * 向房间广播消息
   * @param room 房间名称
   * @param message 消息数据
   */
  broadcastToRoom(room: string, message: AdapterMessage): Promise<void> | void;

  /**
   * 订阅消息（用于接收来自其他服务器的消息）
   * @param callback 消息回调函数
   */
  subscribe(
    callback: (message: AdapterMessage, serverId: string) => void,
  ): Promise<void> | void;

  /**
   * 取消订阅
   */
  unsubscribe(): Promise<void> | void;

  /**
   * 获取所有服务器 ID
   * @returns 服务器 ID 列表
   */
  getServerIds(): Promise<string[]> | string[];

  /**
   * 注册服务器
   */
  registerServer(): Promise<void> | void;

  /**
   * 注销服务器
   */
  unregisterServer(): Promise<void> | void;

  /**
   * 设置 Logger（可选，由 Server 在初始化时调用，用于统一日志输出）
   */
  setLogger?(logger: Logger): void;
}
