/**
 * @fileoverview Socket.IO Socket
 * 表示一个 Socket.IO 连接
 */

import { EngineSocket } from "../engine/socket.ts";
import {
  EnginePacketType,
  Handshake,
  SocketData,
  SocketEventListener,
  SocketIOPacket,
  SocketIOPacketType,
} from "../types.ts";
import { decodePacket, encodePacket } from "./parser.ts";
import { ParserCache } from "./parser-cache.ts";

/**
 * Socket.IO Socket
 */
export class SocketIOSocket {
  /** Socket ID */
  public readonly id: string;
  /** 命名空间 */
  public readonly nsp: string;
  /** 握手信息 */
  public readonly handshake: Handshake;
  /** 数据存储 */
  public data: SocketData = {};
  /** 是否已连接 */
  public connected = true;
  /** 房间列表（延迟初始化） */
  private _rooms?: Set<string>;
  /** 事件监听器（使用 Set 优化查找和移除性能，延迟初始化） */
  private _listeners?: Map<string, Set<SocketEventListener>>;
  /** Engine.IO Socket */
  private engineSocket: EngineSocket;
  /** 确认回调映射（ID -> 回调函数，延迟初始化） */
  private _ackCallbacks?: Map<number, (response: any) => void>;
  /** 下一个确认 ID */
  private nextAckId = 0;
  /** 解析器缓存 */
  private static parserCache: ParserCache = new ParserCache(1000);

  /**
   * 创建 Socket.IO Socket
   * @param engineSocket Engine.IO Socket
   * @param nsp 命名空间
   */
  constructor(engineSocket: EngineSocket, nsp: string = "/") {
    this.engineSocket = engineSocket;
    this.id = engineSocket.id;
    this.nsp = nsp;
    this.handshake = engineSocket.handshake;
    this.connected = true;

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
   * 获取房间列表（延迟初始化）
   */
  private get rooms(): Set<string> {
    if (!this._rooms) {
      this._rooms = new Set();
    }
    return this._rooms;
  }

  /**
   * 获取事件监听器（延迟初始化）
   */
  private get listeners(): Map<string, Set<SocketEventListener>> {
    if (!this._listeners) {
      this._listeners = new Map();
    }
    return this._listeners;
  }

  /**
   * 获取确认回调映射（延迟初始化）
   */
  private get ackCallbacks(): Map<number, (response: any) => void> {
    if (!this._ackCallbacks) {
      this._ackCallbacks = new Map();
    }
    return this._ackCallbacks;
  }

  /**
   * 处理 Socket.IO 数据包
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
        case SocketIOPacketType.CONNECT:
          // 连接确认（客户端发送）
          // 发送 CONNECT 响应数据包给客户端
          const connectResponse = {
            type: SocketIOPacketType.CONNECT,
            nsp: this.nsp,
          };
          this.sendSocketIOPacket(connectResponse);
          this.triggerEvent("connect");
          break;

        case SocketIOPacketType.DISCONNECT:
          // 断开连接
          this.disconnect(packet.data);
          break;

        case SocketIOPacketType.EVENT:
        case SocketIOPacketType.BINARY_EVENT:
          // 事件数据包
          this.handleEvent(packet);
          break;

        case SocketIOPacketType.ACK:
        case SocketIOPacketType.BINARY_ACK:
          // 确认数据包
          this.handleAck(packet);
          break;

        default:
          break;
      }
    } catch (error) {
      console.error("Socket.IO 数据包处理错误:", error);
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
   * @param packet 数据包
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
   * 发送确认
   * @param id 确认 ID
   * @param data 响应数据
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
   * @param packet 数据包
   */
  private sendSocketIOPacket(packet: SocketIOPacket): void {
    const encoded = encodePacket(packet);
    this.sendRaw(encoded);
  }

  /**
   * 发送已序列化的 Socket.IO 数据包（用于优化，避免重复序列化）
   * @param encoded 已序列化的数据包字符串
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
   * 发送事件
   * @param event 事件名称
   * @param data 事件数据
   * @param callback 确认回调（可选）
   */
  emit(event: string, data?: any, callback?: (response: any) => void): void {
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
   * 监听事件
   * @param event 事件名称
   * @param listener 监听器函数
   */
  on(event: string, listener: SocketEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * 移除事件监听器
   * @param event 事件名称
   * @param listener 监听器函数（可选，不提供则移除所有监听器）
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
    data?: any,
    callback?: (response: any) => void,
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data, callback);
        } catch (error) {
          console.error(`事件监听器错误 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 加入房间
   * @param room 房间名称
   */
  join(room: string): void {
    this.rooms.add(room);
    // 通知命名空间（由命名空间处理）
  }

  /**
   * 离开房间
   * @param room 房间名称
   */
  leave(room: string): void {
    this.rooms.delete(room);
    // 通知命名空间（由命名空间处理）
  }

  /**
   * 获取房间列表
   */
  getRooms(): Set<string> {
    return new Set(this.rooms);
  }

  /**
   * 断开连接
   * @param reason 断开原因
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
   * 获取 Engine.IO Socket
   */
  getEngineSocket(): EngineSocket {
    return this.engineSocket;
  }

  /**
   * 重置 Socket（用于对象池）
   * @param engineSocket 新的 Engine.IO Socket
   * @param nsp 命名空间
   */
  reset(engineSocket: EngineSocket, nsp: string): void {
    // 清理旧的状态
    this.cleanup();

    // 设置新的状态
    this.engineSocket = engineSocket;
    (this as any).id = engineSocket.id;
    (this as any).nsp = nsp;
    (this as any).handshake = engineSocket.handshake;
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
