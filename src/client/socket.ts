/**
 * @fileoverview Socket.IO 客户端 Socket
 * 表示一个客户端 Socket.IO 连接
 */

import {
  EnginePacketType,
  SocketData,
  SocketEventListener,
  SocketIOPacket,
  SocketIOPacketType,
} from "../types.ts";
import { decodePacket, encodePacket } from "../socketio/parser.ts";
import { ClientTransport } from "./transport.ts";

/**
 * Socket.IO 客户端 Socket
 */
export class ClientSocket {
  /** Socket ID */
  public id: string = "";
  /** 命名空间 */
  public readonly nsp: string;
  /** 数据存储 */
  public data: SocketData = {};
  /** 是否已连接 */
  public connected = false;
  /** 事件监听器 */
  private listeners: Map<string, SocketEventListener[]> = new Map();
  /** 传输层 */
  private transport: ClientTransport;
  /** 确认回调映射（ID -> 回调函数） */
  private ackCallbacks: Map<number, (response: any) => void> = new Map();
  /** 下一个确认 ID */
  private nextAckId = 0;

  /**
   * 创建 Socket.IO 客户端 Socket
   * @param transport 传输层
   * @param nsp 命名空间
   */
  constructor(transport: ClientTransport, nsp: string = "/") {
    this.transport = transport;
    this.nsp = nsp;

    // 监听传输层数据包
    this.transport.on((packet) => {
      if (packet.type === EnginePacketType.OPEN && typeof packet.data === "string") {
        // 处理握手数据包
        try {
          const handshake = JSON.parse(packet.data);
          this.id = handshake.sid;
          // 发送连接数据包
          this.sendConnect();
        } catch (error) {
          console.error("握手数据解析错误:", error);
        }
      } else if (
        packet.type === EnginePacketType.MESSAGE &&
        typeof packet.data === "string"
      ) {
        this.handleSocketIOPacket(packet.data);
      } else if (packet.type === EnginePacketType.CLOSE) {
        // 连接关闭
        this.disconnect();
      }
    });
  }

  /**
   * 处理 Socket.IO 数据包
   * @param data 数据包字符串
   */
  private handleSocketIOPacket(data: string): void {
    try {
      const packet = decodePacket(data);

      // 检查命名空间是否匹配
      if (packet.nsp && packet.nsp !== this.nsp) {
        return;
      }

      switch (packet.type) {
        case SocketIOPacketType.CONNECT:
          // 连接成功
          this.connected = true;
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

        case SocketIOPacketType.CONNECT_ERROR:
          // 连接错误
          this.triggerEvent("connect_error", packet.data);
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
   * 发送连接数据包
   */
  private sendConnect(): void {
    const packet: SocketIOPacket = {
      type: SocketIOPacketType.CONNECT,
      nsp: this.nsp,
    };
    this.sendSocketIOPacket(packet);
  }

  /**
   * 发送 Socket.IO 数据包
   * @param packet 数据包
   */
  private sendSocketIOPacket(packet: SocketIOPacket): void {
    const encoded = encodePacket(packet);
    this.transport.send({
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
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
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

    if (listener) {
      const listeners = this.listeners.get(event)!;
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
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

    // 关闭传输层
    this.transport.close();

    // 触发断开连接事件
    this.triggerEvent("disconnect", reason);
  }
}
