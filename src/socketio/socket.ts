/**
 * @fileoverview Socket.IO Socket
 * 表示一个 Socket.IO 连接
 */

import type { Logger } from "@dreamer/logger";
import type { Server } from "../server.ts";
import { EngineSocket } from "../engine/socket.ts";
import {
  EnginePacketType,
  Handshake,
  SocketData,
  SocketEventListener,
  SocketIOPacket,
  SocketIOPacketType,
} from "../types.ts";
import { ParserCache } from "./parser-cache.ts";
import { encodePacket } from "./parser.ts";

/**
 * 房间管理器接口
 * 用于让 Socket 访问房间信息（可以是命名空间的，也可以是 Socket 自己的）
 */
export interface RoomManager {
  /** 获取房间内的所有 Socket */
  getSocketsInRoom(room: string): SocketIOSocket[];
  /** 获取所有 Socket */
  getAllSockets(): SocketIOSocket[];
  /** 获取消息缓存 */
  getMessageCache(): { getOrCreate: (packet: any) => string };
  /** 获取消息队列 */
  getMessageQueue(): {
    enqueue: (
      socket: SocketIOSocket,
      encoded: string,
      priority: number,
    ) => void;
  };
  /** 获取适配器 */
  getAdapter(): {
    broadcastToRoom?: (room: string, message: any) => void | Promise<void>;
    broadcast?: (message: any) => void | Promise<void>;
  } | undefined;
  /** 获取命名空间名称 */
  getNamespaceName(): string;
}

/**
 * Socket.IO Socket
 */
export class SocketIOSocket {
  /** Socket ID（对象池 reset 时可更新） */
  private _id: string;
  /** 命名空间（对象池 reset 时可更新） */
  private _nsp: string;
  /** 握手信息（对象池 reset 时可更新） */
  private _handshake: Handshake;
  /** 数据存储 */
  public data: SocketData = {};

  /** Socket ID（公开只读） */
  public get id(): string {
    return this._id;
  }
  /** 命名空间（公开只读） */
  public get nsp(): string {
    return this._nsp;
  }
  /** 握手信息（公开只读） */
  public get handshake(): Handshake {
    return this._handshake;
  }

  /**
   * 获取 Server 实例（与 @dreamer/websocket 对齐）
   *
   * 供中间件、MessageQueue 等调用 tr 等方法。
   *
   * @returns Server 实例，若 Socket 未关联 Server 则返回 undefined
   *
   * @example
   * ```typescript
   * socket.on("message", () => {
   *   const server = socket.getServer();
   *   if (server) {
   *     const msg = server.options.t?.("key", {}) ?? "fallback";
   *   }
   * });
   * ```
   */
  getServer(): Server | undefined {
    return this._server;
  }

  /** 是否已连接 */
  public connected = true;
  /** 房间列表（延迟初始化） */
  private _rooms?: Set<string>;
  /** 事件监听器（使用 Set 优化查找和移除性能，延迟初始化） */
  private _listeners?: Map<string, Set<SocketEventListener>>;
  /** Engine.IO Socket */
  private engineSocket: EngineSocket;
  /** 确认回调映射（ID -> 回调函数，延迟初始化） */
  private _ackCallbacks?: Map<number, (response: unknown) => void>;
  /** 下一个确认 ID */
  private nextAckId = 0;
  /** 解析器缓存 */
  private static parserCache: ParserCache = new ParserCache(1000);
  /** 是否压缩下一次发送的消息 */
  private _compress = false;
  /** 排除的房间或 socket ID 列表（用于链式调用） */
  private _except: Set<string> = new Set();
  /** 房间管理器（可选，如果设置则使用外部管理器，否则使用 Socket 自己的房间管理） */
  private roomManager?: RoomManager;
  /** Socket 自己的房间管理：房间到 Socket 的映射（房间名称 -> Set<Socket ID>） */
  private localRooms: Map<string, Set<string>> = new Map();
  /** Socket 自己的房间管理：Socket 到房间的映射（Socket ID -> Set<房间名称>） */
  private localSocketToRooms: Map<string, Set<string>> = new Map();
  /** Socket 自己的房间管理：所有 Socket 的映射（Socket ID -> SocketIOSocket） */
  private localSockets: Map<string, SocketIOSocket> = new Map();
  /** Socket 自己的消息缓存 */
  private localMessageCache: Map<string, string> = new Map();
  /** Logger 实例（统一日志输出，可选） */
  private _logger?: Logger;
  /** Server 实例（可选，用于 getServer() 与 websocket 对齐） */
  private _server?: Server;

  /**
   * 创建 Socket.IO Socket 实例
   *
   * Socket 表示一个客户端连接，封装了 Engine.IO Socket 并提供 Socket.IO 协议支持。
   * 每个 Socket 都有唯一的 ID，可以加入多个房间，并支持事件监听和发送。
   *
   * @param engineSocket - Engine.IO Socket 实例，负责底层网络通信
   * @param nsp - 命名空间，默认为 "/"
   * @param logger - Logger 实例（可选），用于统一日志输出
   * @param server - Server 实例（可选），用于 getServer() 与 websocket 对齐
   *
   * @example
   * ```typescript
   * const socket = new SocketIOSocket(engineSocket, "/chat");
   * ```
   */
  constructor(
    engineSocket: EngineSocket,
    nsp: string = "/",
    logger?: Logger,
    server?: Server,
  ) {
    this.engineSocket = engineSocket;
    this._id = engineSocket.id;
    this._nsp = nsp;
    this._handshake = engineSocket.handshake;
    this.connected = true;
    this._logger = logger;
    this._server = server;

    // 监听 Engine.IO 数据包
    this.engineSocket.on((packet) => {
      if (
        packet.type === EnginePacketType.MESSAGE &&
        typeof packet.data === "string"
      ) {
        this.handleSocketIOPacket(packet.data);
      }
    });
  }

  /**
   * 获取 Socket 所在的房间列表（标准 Socket.IO API）
   *
   * 返回一个 Set，包含该 Socket 当前所在的所有房间名称。
   * 使用延迟初始化，只有在访问时才会创建 Set。
   *
   * @returns 房间名称的 Set
   *
   * @example
   * ```typescript
   * socket.join("room-1");
   * socket.join("room-2");
   * console.log(socket.rooms); // Set { "room-1", "room-2" }
   * ```
   */
  public get rooms(): Set<string> {
    if (!this._rooms) {
      this._rooms = new Set();
    }
    return this._rooms;
  }

  /**
   * 将 Socket 加入房间（供 Namespace 等内部模块调用，与 join 配合使用）
   * @param room 房间名称
   * @internal
   */
  addToRoom(room: string): void {
    if (!this._rooms) {
      this._rooms = new Set();
    }
    this._rooms.add(room);
  }

  /**
   * 将 Socket 移出房间（供 Namespace 等内部模块调用，与 leave 配合使用）
   * @param room 房间名称
   * @internal
   */
  removeFromRoom(room: string): void {
    this._rooms?.delete(room);
  }

  /**
   * 获取事件监听器映射（延迟初始化）
   *
   * 返回事件名称到监听器集合的映射。使用延迟初始化优化内存使用。
   *
   * @returns 事件名称到监听器集合的映射
   *
   * @internal
   */
  private get listeners(): Map<string, Set<SocketEventListener>> {
    if (!this._listeners) {
      this._listeners = new Map();
    }
    return this._listeners;
  }

  /**
   * 获取确认回调映射（延迟初始化）
   *
   * 返回确认 ID 到回调函数的映射。使用延迟初始化优化内存使用。
   *
   * @returns 确认 ID 到回调函数的映射
   *
   * @internal
   */
  private get ackCallbacks(): Map<number, (response: unknown) => void> {
    if (!this._ackCallbacks) {
      this._ackCallbacks = new Map();
    }
    return this._ackCallbacks;
  }

  /**
   * 处理 Socket.IO 数据包（供 Server 等内部模块调用）
   * @param data 数据包字符串
   * @internal
   */
  processPacket(data: string): void {
    this.handleSocketIOPacket(data);
  }

  /**
   * 内部处理 Socket.IO 数据包
   * @param data 数据包字符串
   */
  private handleSocketIOPacket(data: string): void {
    try {
      // 使用解析器缓存
      const packet = SocketIOSocket.parserCache.decode(data);

      // 检查命名空间是否匹配
      if (packet.nsp && packet.nsp !== this.nsp) {
        return;
      }

      switch (packet.type) {
        case SocketIOPacketType.CONNECT: {
          // 连接确认（客户端发送）
          // 发送 CONNECT 响应数据包给客户端
          const connectResponse = {
            type: SocketIOPacketType.CONNECT,
            nsp: this.nsp,
          };
          this.sendSocketIOPacket(connectResponse);
          this.triggerEvent("connect");
          break;
        }

        case SocketIOPacketType.DISCONNECT: {
          // 断开连接（data 为断开原因字符串）
          this.disconnect(
            typeof packet.data === "string" ? packet.data : undefined,
          );
          break;
        }

        case SocketIOPacketType.EVENT:
        case SocketIOPacketType.BINARY_EVENT: {
          // 事件数据包
          this.handleEvent(packet);
          break;
        }

        case SocketIOPacketType.ACK:
        case SocketIOPacketType.BINARY_ACK: {
          // 确认数据包
          this.handleAck(packet);
          break;
        }

        default: {
          break;
        }
      }
    } catch (error) {
      (this._logger?.error ?? console.error)("Socket.IO 数据包处理错误:", error);
    }
  }

  /**
   * 处理事件数据包
   * @param packet 数据包
   */
  private handleEvent(packet: SocketIOPacket): void {
    if (
      !packet.data || !Array.isArray(packet.data) || packet.data.length === 0
    ) {
      return;
    }

    const eventName = packet.data[0];
    const eventData = packet.data.length > 1 ? packet.data[1] : undefined;

    // 如果有确认 ID，创建回调函数
    let callback: ((response: any) => void) | undefined;
    if (packet.id !== undefined) {
      callback = (response: any) => {
        this.sendAck(packet.id!, response);
      };
    }

    // 触发事件
    this.triggerEvent(eventName, eventData, callback);
  }

  /**
   * 处理确认数据包
   *
   * 当客户端响应服务器发送的带确认的事件时，会收到确认数据包。
   * 根据确认 ID 查找对应的回调函数并执行，然后从映射中移除。
   *
   * @param packet - Socket.IO 确认数据包，包含确认 ID 和响应数据
   *
   * @internal
   */
  private handleAck(packet: SocketIOPacket): void {
    if (packet.id === undefined) {
      return;
    }

    const callback = this.ackCallbacks.get(packet.id);
    if (callback) {
      this.ackCallbacks.delete(packet.id);
      callback(packet.data);
    }
  }

  /**
   * 发送确认响应
   *
   * 当客户端发送带确认 ID 的事件时，服务器可以通过此方法发送确认响应。
   *
   * @param id - 确认 ID，与客户端发送的事件数据包中的 ID 对应
   * @param data - 响应数据，会发送给客户端
   *
   * @internal
   */
  private sendAck(id: number, data: any): void {
    const packet: SocketIOPacket = {
      type: SocketIOPacketType.ACK,
      nsp: this.nsp,
      id,
      data,
    };

    this.sendSocketIOPacket(packet);
  }

  /**
   * 发送 Socket.IO 数据包
   *
   * 将 Socket.IO 数据包编码后通过 Engine.IO Socket 发送给客户端。
   *
   * @param packet - Socket.IO 数据包对象
   *
   * @internal
   */
  private sendSocketIOPacket(packet: SocketIOPacket): void {
    const encoded = encodePacket(packet);
    this.sendRaw(encoded);
  }

  /**
   * 发送已序列化的 Socket.IO 数据包（用于优化，避免重复序列化）
   *
   * 此方法用于发送已经序列化的数据包字符串，避免重复序列化以提高性能。
   * 主要用于批量发送相同消息到多个 Socket 的场景。
   *
   * @param encoded - 已序列化的 Socket.IO 数据包字符串
   *
   * @example
   * ```typescript
   * const encoded = encodePacket(packet);
   * socket.sendRaw(encoded);
   * ```
   */
  sendRaw(encoded: string): void {
    if (!this.connected) {
      return;
    }
    this.engineSocket.send({
      type: EnginePacketType.MESSAGE,
      data: encoded,
    });
  }

  /**
   * 向客户端发送事件
   *
   * 如果提供了回调函数，客户端可以通过回调返回响应数据。
   * 如果 Socket 未连接，事件不会发送。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param data - 事件数据，可以是任意类型（对象、数组、字符串、数字等）
   * @param callback - 确认回调函数（可选），客户端可以通过回调返回响应数据
   *
   * @example
   * ```typescript
   * // 发送简单事件
   * socket.emit("message", { text: "Hello" });
   *
   * // 发送带确认的事件
   * socket.emit("get-user-info", { userId: 123 }, (response) => {
   *   console.log("客户端响应:", response);
   * });
   * ```
   */
  emit(
    event: string,
    data?: unknown,
    callback?: (response: unknown) => void,
  ): void {
    if (!this.connected) {
      return;
    }

    // 如果有回调，分配确认 ID
    let ackId: number | undefined;
    if (callback) {
      ackId = this.nextAckId++;
      this.ackCallbacks.set(ackId, callback);
    }

    const packet: SocketIOPacket = {
      type: SocketIOPacketType.EVENT,
      nsp: this.nsp,
      id: ackId,
      data: data !== undefined ? [event, data] : [event],
    };

    this.sendSocketIOPacket(packet);
  }

  /**
   * 监听客户端发送的事件
   *
   * 注册一个事件监听器，当客户端发送对应事件时，监听器会被调用。
   * 可以为一个事件注册多个监听器，它们会按注册顺序依次调用。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param listener - 监听器函数，接收事件数据和可选的确认回调作为参数
   *
   * @example
   * ```typescript
   * socket.on("chat-message", (data, callback) => {
   *   console.log("收到消息:", data);
   *   // 如果有确认回调，可以发送响应
   *   if (callback) {
   *     callback({ received: true });
   *   }
   * });
   * ```
   */
  on(event: string, listener: SocketEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * 移除事件监听器
   *
   * 如果提供了 `listener` 参数，则只移除该特定的监听器。
   * 如果不提供 `listener` 参数，则移除该事件的所有监听器。
   *
   * @param event - 事件名称
   * @param listener - 要移除的监听器函数（可选），不提供则移除该事件的所有监听器
   *
   * @example
   * ```typescript
   * const handler = (data) => console.log(data);
   * socket.on("message", handler);
   *
   * // 移除特定监听器
   * socket.off("message", handler);
   *
   * // 移除所有监听器
   * socket.off("message");
   * ```
   */
  off(event: string, listener?: SocketEventListener): void {
    if (!this.listeners.has(event)) {
      return;
    }

    const listeners = this.listeners.get(event)!;
    if (listener) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
    } else {
      this.listeners.delete(event);
    }
  }

  /**
   * 触发事件（内部使用）
   * @param event 事件名称
   * @param data 事件数据
   * @param callback 确认回调（可选）
   */
  private triggerEvent(
    event: string,
    data?: unknown,
    callback?: (response: unknown) => void,
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data, callback);
        } catch (error) {
          (this._logger?.error ?? console.error)(`事件监听器错误 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 设置房间管理器
   *
   * 设置外部房间管理器（通常是 Namespace 实例），用于管理房间和 Socket 的关系。
   * 如果不设置，Socket 会使用自己的本地房间管理。
   *
   * @param manager - 房间管理器实例（可选），如果不设置则使用 Socket 自己的房间管理
   *
   * @internal
   */
  setRoomManager(manager?: RoomManager): void {
    this.roomManager = manager;
  }

  /**
   * 加入房间
   *
   * 将当前 Socket 加入到指定的房间。加入房间后，可以通过 `to(room)` 或 `in(room)`
   * 向该房间内的所有 Socket 发送消息。
   *
   * 如果设置了外部房间管理器（如 Namespace），会使用管理器的房间管理。
   * 否则使用 Socket 自己的本地房间管理。
   *
   * @param room - 房间名称，可以是任意字符串
   *
   * @example
   * ```typescript
   * socket.join("room-123");
   * socket.join("chat");
   * ```
   */
  join(room: string): void {
    this.rooms.add(room);

    // 如果使用外部房间管理器，由管理器处理
    // 否则使用 Socket 自己的房间管理
    if (!this.roomManager) {
      this.addToLocalRoom(room);
    }
  }

  /**
   * 离开房间
   *
   * 将当前 Socket 从指定的房间中移除。离开后，将不再接收发送到该房间的消息。
   *
   * 如果设置了外部房间管理器（如 Namespace），会使用管理器的房间管理。
   * 否则使用 Socket 自己的本地房间管理。
   *
   * @param room - 房间名称
   *
   * @example
   * ```typescript
   * socket.leave("room-123");
   * ```
   */
  leave(room: string): void {
    this.rooms.delete(room);

    // 如果使用外部房间管理器，由管理器处理
    // 否则使用 Socket 自己的房间管理
    if (!this.roomManager) {
      this.removeFromLocalRoom(room);
    }
  }

  /**
   * 添加到本地房间（Socket 自己的房间管理）
   *
   * 当 Socket 不使用外部房间管理器时，使用此方法管理本地房间。
   * 更新房间索引和 Socket 索引。
   *
   * @param room - 房间名称
   *
   * @internal
   */
  private addToLocalRoom(room: string): void {
    if (!this.localRooms.has(room)) {
      this.localRooms.set(room, new Set());
    }
    this.localRooms.get(room)!.add(this.id);

    if (!this.localSocketToRooms.has(this.id)) {
      this.localSocketToRooms.set(this.id, new Set());
    }
    this.localSocketToRooms.get(this.id)!.add(room);

    // 将自己添加到本地 Socket 映射
    this.localSockets.set(this.id, this);
  }

  /**
   * 从本地房间移除（Socket 自己的房间管理）
   *
   * 当 Socket 不使用外部房间管理器时，使用此方法管理本地房间。
   * 更新房间索引和 Socket 索引，如果房间为空则删除房间。
   *
   * @param room - 房间名称
   *
   * @internal
   */
  private removeFromLocalRoom(room: string): void {
    const roomSockets = this.localRooms.get(room);
    if (roomSockets) {
      roomSockets.delete(this.id);
      if (roomSockets.size === 0) {
        this.localRooms.delete(room);
      }
    }

    const socketRooms = this.localSocketToRooms.get(this.id);
    if (socketRooms) {
      socketRooms.delete(room);
      if (socketRooms.size === 0) {
        this.localSocketToRooms.delete(this.id);
      }
    }
  }

  /**
   * 获取 Socket 所在的房间列表
   *
   * 返回房间列表的副本，修改返回的 Set 不会影响原始房间列表。
   *
   * @returns 房间名称的 Set（副本）
   *
   * @example
   * ```typescript
   * const rooms = socket.getRooms();
   * console.log(`Socket 在 ${rooms.size} 个房间中`);
   * ```
   */
  getRooms(): Set<string> {
    return new Set(this.rooms);
  }

  /**
   * 向指定房间内的所有 Socket 发送消息（不包括自己）
   *
   * 返回一个链式调用对象，可以继续调用 `to()`, `in()`, `except()`, `compress()` 等方法，
   * 最后调用 `emit()` 发送消息。
   *
   * 如果设置了房间管理器（如 Namespace），会使用管理器的房间信息和消息缓存/队列。
   * 否则使用 Socket 自己的本地房间管理。
   *
   * @param room - 房间名称
   * @returns 返回一个链式调用对象，包含 `emit`, `to`, `in`, `except`, `compress` 等方法
   *
   * @example
   * ```typescript
   * // 向房间发送消息
   * socket.to("room-123").emit("message", { text: "Hello" });
   *
   * // 链式调用：向多个房间发送，排除某些 Socket
   * socket.to("room-1").to("room-2").except("socket-id-123").emit("message", data);
   * ```
   */
  to(room: string): {
    emit: (event: string, data?: unknown) => void;
    to: (room: string) => ReturnType<SocketIOSocket["to"]>;
    in: (room: string) => ReturnType<SocketIOSocket["to"]>;
    except: (room: string | string[]) => ReturnType<SocketIOSocket["to"]>;
    compress: (value: boolean) => ReturnType<SocketIOSocket["to"]>;
  } {
    const targetRooms = new Set<string>([room]);
    const except = new Set<string>(this._except);

    const builder = {
      emit: (event: string, data?: unknown) => {
        // 收集所有目标房间的 socket
        const targetSocketIds = new Set<string>();

        if (this.roomManager) {
          // 使用外部房间管理器（命名空间）
          for (const targetRoom of targetRooms) {
            const sockets = this.roomManager.getSocketsInRoom(targetRoom);
            for (const socket of sockets) {
              // 排除当前 socket 和 except 列表中的 socket
              if (socket.id !== this.id && !except.has(socket.id)) {
                targetSocketIds.add(socket.id);
              }
            }
          }
        } else {
          // 使用 Socket 自己的房间管理
          for (const targetRoom of targetRooms) {
            const roomSockets = this.localRooms.get(targetRoom);
            if (roomSockets) {
              for (const socketId of roomSockets) {
                // 排除当前 socket 和 except 列表中的 socket
                if (socketId !== this.id && !except.has(socketId)) {
                  targetSocketIds.add(socketId);
                }
              }
            }
          }
        }

        if (targetSocketIds.size === 0) {
          // 重置状态
          this._except.clear();
          this._compress = false;
          return;
        }

        // 使用消息缓存，只序列化一次
        const packet: SocketIOPacket = {
          type: SocketIOPacketType.EVENT,
          nsp: this.nsp,
          data: [event, data],
        };

        let encoded: string;
        if (this.roomManager) {
          // 使用外部房间管理器的消息缓存
          encoded = this.roomManager.getMessageCache().getOrCreate(packet);
        } else {
          // 使用直接编码
          encoded = encodePacket(packet);
        }

        // 获取目标 socket 并发送消息
        const socketsToSend: SocketIOSocket[] = [];
        if (this.roomManager) {
          // 使用外部房间管理器获取 socket
          const allSockets = this.roomManager.getAllSockets();
          for (const socket of allSockets) {
            if (targetSocketIds.has(socket.id) && socket.connected) {
              socketsToSend.push(socket);
            }
          }
        } else {
          // 使用 Socket 自己的房间管理获取 socket
          for (const socketId of targetSocketIds) {
            const socket = this.localSockets.get(socketId);
            if (socket && socket.connected) {
              socketsToSend.push(socket);
            }
          }
        }

        // 发送消息
        if (this.roomManager) {
          // 使用外部房间管理器的消息队列
          const messageQueue = this.roomManager.getMessageQueue();
          for (const targetSocket of socketsToSend) {
            messageQueue.enqueue(targetSocket, encoded, 0);
          }
        } else {
          // 直接发送
          for (const targetSocket of socketsToSend) {
            targetSocket.sendRaw(encoded);
          }
        }

        // 如果使用外部房间管理器，通过适配器广播到其他服务器
        if (this.roomManager) {
          const adapter = this.roomManager.getAdapter();
          if (adapter?.broadcastToRoom) {
            const adapterMessage = {
              namespace: this.roomManager.getNamespaceName(),
              room: Array.from(targetRooms)[0],
              event,
              data,
              packet,
              excludeSocketId: this.id,
            };
            const result = adapter.broadcastToRoom(
              Array.from(targetRooms)[0],
              adapterMessage,
            );
            if (result instanceof Promise) {
              result.catch((error) => {
                (this._logger?.error ?? console.error)("适配器房间广播失败:", error);
              });
            }
          }
        }

        // 重置状态
        this._except.clear();
        this._compress = false;
      },
      to: (r: string) => {
        targetRooms.add(r);
        return builder;
      },
      in: (_r: string) => {
        return builder;
      },
      except: (r: string | string[]) => {
        const rooms = Array.isArray(r) ? r : [r];
        rooms.forEach((roomId) => except.add(roomId));
        return builder;
      },
      compress: (value: boolean) => {
        this._compress = value;
        return builder;
      },
    };

    return builder;
  }

  /**
   * in() 是 to() 的别名
   *
   * 功能与 `to()` 方法完全相同，只是为了提供更符合语义的 API。
   *
   * @param room - 房间名称
   * @returns 返回与 `to()` 方法相同的链式调用对象
   *
   * @example
   * ```typescript
   * socket.in("room-123").emit("message", { text: "Hello" });
   * ```
   */
  in(room: string): ReturnType<SocketIOSocket["to"]> {
    return this.to(room);
  }

  /**
   * 排除指定的房间或 Socket ID
   *
   * 返回一个链式调用对象，可以配合 `to()` 或 `in()` 使用，排除指定的 Socket。
   * 如果不配合 `to()` 或 `in()` 使用，会发出警告并直接发送给当前 Socket。
   *
   * @param room - 房间名称或 Socket ID，或数组（可以同时排除多个）
   * @returns 返回一个链式调用对象，包含 `emit`, `to`, `in`, `except`, `compress` 等方法
   *
   * @example
   * ```typescript
   * // 向房间发送消息，但排除特定 Socket
   * socket.to("room-123").except("socket-id-456").emit("message", data);
   *
   * // 排除多个 Socket
   * socket.to("room-123").except(["socket-1", "socket-2"]).emit("message", data);
   * ```
   */
  except(room: string | string[]): {
    emit: (event: string, data?: unknown) => void;
    to: (room: string) => ReturnType<SocketIOSocket["to"]>;
    in: (room: string) => ReturnType<SocketIOSocket["to"]>;
    except: (room: string | string[]) => ReturnType<SocketIOSocket["to"]>;
    compress: (value: boolean) => ReturnType<SocketIOSocket["to"]>;
  } {
    const rooms = Array.isArray(room) ? room : [room];
    rooms.forEach((r) => this._except.add(r));
    // 返回一个可以链式调用的对象，但需要先调用 to() 或 in()
    const builder = {
      emit: (event: string, data?: unknown) => {
        // 如果没有指定房间，则向所有房间广播（除了排除的）
        (this._logger?.warn ?? console.warn)(
          "[SocketIOSocket] except() 需要配合 to() 或 in() 使用",
        );
        this.emit(event, data);
        this._except.clear();
      },
      to: (r: string) => {
        return this.to(r);
      },
      in: (r: string) => {
        return this.to(r);
      },
      except: (r: string | string[]) => {
        return this.except(r);
      },
      compress: (value: boolean) => {
        this._compress = value;
        return builder;
      },
    };
    return builder;
  }

  /**
   * 设置是否压缩下一次发送的消息
   *
   * 如果设置为 true，下一次发送的消息会被压缩（如果支持压缩）。
   * 返回自身以支持链式调用。
   *
   * @param value - 是否压缩，true 表示压缩，false 表示不压缩
   * @returns 返回自身，支持链式调用
   *
   * @example
   * ```typescript
   * socket.compress(true).emit("large-data", largeObject);
   * ```
   */
  compress(value: boolean): this {
    this._compress = value;
    return this;
  }

  /**
   * 广播对象，用于向所有其他 Socket 发送消息（不包括自己）
   *
   * 返回一个链式调用对象，可以继续调用 `to()`, `in()`, `except()`, `compress()` 等方法，
   * 最后调用 `emit()` 发送消息。
   *
   * 如果设置了房间管理器（如 Namespace），会使用管理器的所有 Socket 和消息缓存/队列。
   * 否则使用 Socket 自己的本地房间管理。
   *
   * @returns 返回一个链式调用对象，包含 `emit`, `to`, `in`, `except`, `compress` 等方法
   *
   * @example
   * ```typescript
   * // 向所有其他 Socket 广播消息
   * socket.broadcast.emit("message", { text: "Hello everyone" });
   *
   * // 链式调用：向所有其他 Socket 广播，但排除某些 Socket
   * socket.broadcast.except("socket-id-123").emit("message", data);
   * ```
   */
  get broadcast(): {
    emit: (event: string, data?: unknown) => void;
    to: (room: string) => ReturnType<SocketIOSocket["to"]>;
    in: (room: string) => ReturnType<SocketIOSocket["to"]>;
    except: (room: string | string[]) => ReturnType<SocketIOSocket["to"]>;
    compress: (value: boolean) => ReturnType<SocketIOSocket["to"]>;
  } {
    return {
      emit: (event: string, data?: unknown) => {
        // 收集所有其他 socket（排除自己）
        const targetSocketIds = new Set<string>();
        const except = new Set<string>(this._except);

        if (this.roomManager) {
          // 使用外部房间管理器（命名空间）
          const allSockets = this.roomManager.getAllSockets();
          for (const socket of allSockets) {
            if (socket.id !== this.id && !except.has(socket.id)) {
              targetSocketIds.add(socket.id);
            }
          }
        } else {
          // 使用 Socket 自己的房间管理
          for (const socketId of this.localSockets.keys()) {
            if (socketId !== this.id && !except.has(socketId)) {
              targetSocketIds.add(socketId);
            }
          }
        }

        if (targetSocketIds.size === 0) {
          // 重置状态
          this._except.clear();
          this._compress = false;
          return;
        }

        // 使用消息缓存，只序列化一次
        const packet: SocketIOPacket = {
          type: SocketIOPacketType.EVENT,
          nsp: this.nsp,
          data: [event, data],
        };

        let encoded: string;
        if (this.roomManager) {
          // 使用外部房间管理器的消息缓存
          encoded = this.roomManager.getMessageCache().getOrCreate(packet);
        } else {
          // 使用直接编码
          encoded = encodePacket(packet);
        }

        // 获取目标 socket 并发送消息
        const socketsToSend: SocketIOSocket[] = [];
        if (this.roomManager) {
          // 使用外部房间管理器获取 socket
          const allSockets = this.roomManager.getAllSockets();
          for (const socket of allSockets) {
            if (targetSocketIds.has(socket.id) && socket.connected) {
              socketsToSend.push(socket);
            }
          }
        } else {
          // 使用 Socket 自己的房间管理获取 socket
          for (const socketId of targetSocketIds) {
            const socket = this.localSockets.get(socketId);
            if (socket && socket.connected) {
              socketsToSend.push(socket);
            }
          }
        }

        // 发送消息
        if (this.roomManager) {
          // 使用外部房间管理器的消息队列
          const messageQueue = this.roomManager.getMessageQueue();
          for (const targetSocket of socketsToSend) {
            messageQueue.enqueue(targetSocket, encoded, 0);
          }
        } else {
          // 直接发送
          for (const targetSocket of socketsToSend) {
            targetSocket.sendRaw(encoded);
          }
        }

        // 如果使用外部房间管理器，通过适配器广播到其他服务器
        if (this.roomManager) {
          const adapter = this.roomManager.getAdapter();
          if (adapter?.broadcast) {
            const adapterMessage = {
              namespace: this.roomManager.getNamespaceName(),
              event,
              data,
              packet,
              excludeSocketId: this.id,
            };
            const result = adapter.broadcast(adapterMessage);
            if (result instanceof Promise) {
              result.catch((error) => {
                (this._logger?.error ?? console.error)("适配器全局广播失败:", error);
              });
            }
          }
        }

        // 重置状态
        this._except.clear();
        this._compress = false;
      },
      to: (room: string) => {
        return this.to(room);
      },
      in: (room: string) => {
        return this.to(room);
      },
      except: (room: string | string[]) => {
        return this.except(room);
      },
      compress: (value: boolean) => {
        this._compress = value;
        return this.broadcast;
      },
    };
  }

  /**
   * 只监听一次事件（标准 Socket.IO API）
   *
   * 注册一个只执行一次的事件监听器。当事件第一次触发时，监听器会被调用，
   * 然后自动移除，不会再次触发。
   *
   * @param event - 事件名称
   * @param listener - 监听器函数，接收事件数据和可选的确认回调作为参数
   *
   * @example
   * ```typescript
   * socket.once("user-joined", (data) => {
   *   console.log("用户首次加入:", data);
   * });
   * ```
   */
  once(event: string, listener: SocketEventListener): void {
    const onceWrapper: SocketEventListener = (...args) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    this.on(event, onceWrapper);
  }

  /**
   * 移除所有事件监听器（标准 Socket.IO API）
   *
   * 如果提供了 `event` 参数，则只移除该事件的所有监听器。
   * 如果不提供 `event` 参数，则移除所有事件的所有监听器。
   *
   * @param event - 事件名称（可选），不提供则移除所有事件的所有监听器
   * @returns 返回自身，支持链式调用
   *
   * @example
   * ```typescript
   * // 移除特定事件的所有监听器
   * socket.removeAllListeners("message");
   *
   * // 移除所有事件的所有监听器
   * socket.removeAllListeners();
   * ```
   */
  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  /**
   * 断开与客户端的连接
   *
   * 断开连接时会：
   * 1. 标记为未连接状态
   * 2. 向客户端发送 DISCONNECT 数据包
   * 3. 关闭底层 Engine.IO Socket
   * 4. 触发 disconnect 事件
   *
   * @param reason - 断开原因（可选），会发送给客户端并传递给 disconnect 事件监听器
   *
   * @example
   * ```typescript
   * socket.disconnect("服务器主动断开");
   * ```
   */
  disconnect(reason?: string): void {
    if (!this.connected) {
      return;
    }

    this.connected = false;

    // 发送断开连接数据包
    const packet: SocketIOPacket = {
      type: SocketIOPacketType.DISCONNECT,
      nsp: this.nsp,
      data: reason,
    };
    this.sendSocketIOPacket(packet);

    // 关闭 Engine.IO Socket
    this.engineSocket.close();

    // 触发断开连接事件
    this.triggerEvent("disconnect", reason);
  }

  /**
   * 获取底层 Engine.IO Socket 实例
   *
   * 用于访问底层 Engine.IO Socket，通常用于高级操作，如关闭底层连接。
   *
   * @returns Engine.IO Socket 实例
   *
   * @example
   * ```typescript
   * const engineSocket = socket.getEngineSocket();
   * engineSocket.close(); // 强制关闭底层连接
   * ```
   */
  getEngineSocket(): EngineSocket {
    return this.engineSocket;
  }

  /**
   * 重置 Socket 状态（用于对象池）
   *
   * 清理当前 Socket 的所有状态，然后使用新的 Engine.IO Socket 和命名空间重新初始化。
   * 这个方法主要用于对象池，允许重用 Socket 对象以减少内存分配。
   *
   * @param engineSocket - 新的 Engine.IO Socket 实例
   * @param nsp - 新的命名空间
   *
   * @internal
   */
  reset(engineSocket: EngineSocket, nsp: string): void {
    // 清理旧的状态
    this.cleanup();

    // 设置新的状态
    this.engineSocket = engineSocket;
    this._id = engineSocket.id;
    this._nsp = nsp;
    this._handshake = engineSocket.handshake;
    this.connected = true;
    this.nextAckId = 0;

    // 重新监听 Engine.IO 数据包
    this.engineSocket.on((packet) => {
      if (
        packet.type === EnginePacketType.MESSAGE &&
        typeof packet.data === "string"
      ) {
        this.handleSocketIOPacket(packet.data);
      }
    });
  }

  /**
   * 清理 Socket 状态（用于对象池）
   *
   * 清理所有状态，包括房间列表、事件监听器、确认回调、数据存储等。
   * 这个方法主要用于对象池，在 Socket 被重用前清理状态。
   *
   * @internal
   */
  cleanup(): void {
    // 清理所有状态
    this._rooms?.clear();
    this._listeners?.clear();
    this._ackCallbacks?.clear();
    this.data = {};
    this.connected = false;

    // 移除 Engine.IO 监听器（如果可能）
    // 注意：EngineSocket 可能没有提供 off 方法，这里先不处理
  }
}
