/**
 * @fileoverview Socket.IO 命名空间
 * 管理命名空间内的 Socket 连接
 */

import { Handshake, Middleware, ServerEventListener, SocketData, SocketEventListener } from "../types.ts";
import { EngineSocket } from "../engine/socket.ts";
import { SocketIOSocket } from "./socket.ts";
import { MessageCache } from "./message-cache.ts";
import { SocketIOPacketType } from "../types.ts";
import { SocketPool } from "./socket-pool.ts";
import { MessageQueue } from "./message-queue.ts";
import type { SocketIOAdapter } from "../adapters/types.ts";

/**
 * Socket.IO 命名空间
 */
export class Namespace {
  /** 命名空间名称 */
  public readonly name: string;
  /** Socket 连接池 */
  private sockets: Map<string, SocketIOSocket> = new Map();
  /** 房间到 Socket 的映射（房间名称 -> Set<Socket ID>） */
  private rooms: Map<string, Set<string>> = new Map();
  /** Socket 到房间的映射（Socket ID -> Set<房间名称>） */
  private socketToRooms: Map<string, Set<string>> = new Map();
  /** 事件监听器 */
  private listeners: ServerEventListener[] = [];
  /** 中间件列表 */
  private middlewares: Middleware[] = [];
  /** 消息缓存 */
  private messageCache: MessageCache;
  /** Socket 对象池 */
  private socketPool: SocketPool = new SocketPool(1000);
  /** 消息队列 */
  private messageQueue: MessageQueue = new MessageQueue(10000, 100);
  /** 分布式适配器（可选） */
  private adapter?: SocketIOAdapter;

  /**
   * 创建命名空间
   * @param name 命名空间名称
   * @param adapter 分布式适配器（可选）
   * @param accelerator 硬件加速器（可选，用于加速消息缓存）
   */
  constructor(
    name: string,
    adapter?: SocketIOAdapter,
    accelerator?: import("../hardware-accel/accelerator.ts").HardwareAccelerator,
  ) {
    this.name = name;
    this.adapter = adapter;
    this.messageCache = new MessageCache(1000, accelerator);
  }

  /**
   * 设置适配器
   * @param adapter 分布式适配器
   */
  setAdapter(adapter: SocketIOAdapter): void {
    this.adapter = adapter;
  }

  /**
   * 添加中间件
   * @param middleware 中间件函数
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 监听连接事件
   * @param event 事件名称（必须是 "connection"）
   * @param listener 监听器函数
   */
  on(event: "connection", listener: ServerEventListener): void {
    if (event !== "connection") {
      throw new Error(`不支持的事件: ${event}`);
    }
    this.listeners.push(listener);
  }

  /**
   * 添加 Socket 连接
   * @param engineSocket Engine.IO Socket
   * @returns Socket.IO Socket
   */
  async addSocket(engineSocket: EngineSocket): Promise<SocketIOSocket> {
    // 执行中间件
    for (const middleware of this.middlewares) {
      await new Promise<void>((resolve, reject) => {
        const socket = new SocketIOSocket(engineSocket, this.name);
        middleware(socket, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    // 从对象池获取 Socket.IO Socket
    const socket = this.socketPool.acquire(engineSocket, this.name);

    // 监听断开连接事件
    socket.on("disconnect", () => {
      this.removeSocket(socket.id);
    });

    // 监听加入房间事件（需要手动处理，因为 Socket 不知道命名空间）
    const originalJoin = socket.join.bind(socket);
    socket.join = (room: string) => {
      originalJoin(room);
      this.addSocketToRoom(socket.id, room);
    };

    const originalLeave = socket.leave.bind(socket);
    socket.leave = (room: string) => {
      originalLeave(room);
      this.removeSocketFromRoom(socket.id, room);
    };

    // 添加到连接池
    this.sockets.set(socket.id, socket);

    // 触发连接事件
    for (const listener of this.listeners) {
      try {
        listener(socket);
      } catch (error) {
        console.error("连接事件监听器错误:", error);
      }
    }

    return socket;
  }

  /**
   * 移除 Socket 连接
   * @param socketId Socket ID
   */
  removeSocket(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) {
      return;
    }

    // 从所有房间中移除（使用索引优化）
    const socketRooms = this.socketToRooms.get(socketId);
    if (socketRooms) {
      for (const room of socketRooms) {
        this.removeSocketFromRoom(socketId, room);
      }
      this.socketToRooms.delete(socketId);
    }

    // 从连接池中移除并释放到对象池
    this.socketPool.release(socket);
    this.sockets.delete(socketId);
  }

  /**
   * 添加 Socket 到房间
   * @param socketId Socket ID
   * @param room 房间名称
   */
  addSocketToRoom(socketId: string, room: string): void {
    // 更新房间索引
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(socketId);

    // 更新 Socket 索引
    if (!this.socketToRooms.has(socketId)) {
      this.socketToRooms.set(socketId, new Set());
    }
    this.socketToRooms.get(socketId)!.add(room);

    // 通知适配器
    if (this.adapter) {
      const result = this.adapter.addSocketToRoom(socketId, room, this.name);
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("适配器添加 Socket 到房间失败:", error);
        });
      }
    }
  }

  /**
   * 从房间中移除 Socket
   * @param socketId Socket ID
   * @param room 房间名称
   */
  removeSocketFromRoom(socketId: string, room: string): void {
    // 从房间索引中移除
    const roomSockets = this.rooms.get(room);
    if (roomSockets) {
      roomSockets.delete(socketId);
      if (roomSockets.size === 0) {
        this.rooms.delete(room);
      }
    }

    // 从 Socket 索引中移除
    const socketRooms = this.socketToRooms.get(socketId);
    if (socketRooms) {
      socketRooms.delete(room);
      if (socketRooms.size === 0) {
        this.socketToRooms.delete(socketId);
      }
    }

    // 通知适配器
    if (this.adapter) {
      const result = this.adapter.removeSocketFromRoom(socketId, room, this.name);
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("适配器从房间移除 Socket 失败:", error);
        });
      }
    }
  }

  /**
   * 向房间内所有 Socket 发送事件
   * @param room 房间名称
   * @param event 事件名称
   * @param data 事件数据
   */
  to(room: string): {
    emit: (event: string, data?: any) => void;
  } {
    return {
      emit: (event: string, data?: any) => {
        const roomSockets = this.rooms.get(room);
        if (!roomSockets || roomSockets.size === 0) {
          return;
        }

        // 使用消息缓存，只序列化一次
        const packet = {
          type: SocketIOPacketType.EVENT,
          nsp: this.name,
          data: [event, data],
        };
        const encoded = this.messageCache.getOrCreate(packet);

        // 批量发送（大房间分批处理）
        const socketArray = Array.from(roomSockets)
          .map(id => this.sockets.get(id))
          .filter(s => s && s.connected) as SocketIOSocket[];

        // 使用消息队列批量发送
        for (const socket of socketArray) {
          this.messageQueue.enqueue(socket, encoded, 0);
        }

        // 通过适配器广播到其他服务器
        if (this.adapter) {
          const packet = {
            type: SocketIOPacketType.EVENT,
            nsp: this.name,
            data: [event, data],
          };
          const result = this.adapter.broadcastToRoom(room, {
            namespace: this.name,
            room,
            packet,
          });
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error("适配器房间广播失败:", error);
            });
          }
        }
      },
    };
  }

  /**
   * 向所有 Socket 发送事件
   * @param event 事件名称
   * @param data 事件数据
   */
  emit(event: string, data?: any): void {
    if (this.sockets.size === 0) {
      return;
    }

    // 使用消息缓存，只序列化一次
    const packet = {
      type: SocketIOPacketType.EVENT,
      nsp: this.name,
      data: [event, data],
    };
    const encoded = this.messageCache.getOrCreate(packet);

    // 批量发送（大量连接时分批处理）
    const socketArray = Array.from(this.sockets.values())
      .filter(s => s.connected);

    // 使用消息队列批量发送
    for (const socket of socketArray) {
      this.messageQueue.enqueue(socket, encoded, 0);
    }

    // 通过适配器广播到其他服务器
    if (this.adapter) {
      const result = this.adapter.broadcast({
        namespace: this.name,
        event,
        data,
        packet,
      });
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("适配器全局广播失败:", error);
        });
      }
    }
  }

  /**
   * 获取 Socket
   * @param socketId Socket ID
   */
  getSocket(socketId: string): SocketIOSocket | undefined {
    return this.sockets.get(socketId);
  }

  /**
   * 获取所有 Socket
   */
  getSockets(): Map<string, SocketIOSocket> {
    return new Map(this.sockets);
  }

  /**
   * 获取房间内的 Socket 数量
   * @param room 房间名称
   */
  getRoomSize(room: string): number {
    return this.rooms.get(room)?.size || 0;
  }
}
