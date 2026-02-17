/**
 * @fileoverview Socket.IO 客户端 Socket
 * 表示一个客户端 Socket.IO 连接
 */

import { decodePacket, encodePacket } from "./socketio-parser.ts";
import {
  EnginePacketType,
  SocketData,
  SocketEventListener,
  SocketIOPacket,
  SocketIOPacketType,
} from "../types.ts";
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
   * 创建 Socket.IO 客户端 Socket 实例
   *
   * @param transport - 传输层实例，负责底层网络通信
   * @param nsp - 命名空间，默认为 "/"
   *
   * @example
   * ```typescript
   * const transport = new ClientWebSocketTransport();
   * const socket = new ClientSocket(transport, "/chat");
   * ```
   */
  constructor(transport: ClientTransport, nsp: string = "/") {
    this.transport = transport;
    this.nsp = nsp;

    // 监听传输层数据包
    this.transport.on((packet) => {
      if (
        packet.type === EnginePacketType.OPEN && typeof packet.data === "string"
      ) {
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
   *
   * 解析并处理从服务器接收到的 Socket.IO 数据包，根据数据包类型执行相应操作：
   * - CONNECT: 标记为已连接并触发 connect 事件
   * - DISCONNECT: 断开连接
   * - EVENT/BINARY_EVENT: 处理事件数据包
   * - ACK/BINARY_ACK: 处理确认数据包
   * - CONNECT_ERROR: 触发连接错误事件
   *
   * @param data - 数据包字符串，需要先解码为 SocketIOPacket 对象
   *
   * @internal
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
          // 断开连接（data 为断开原因字符串）
          this.disconnect(
            typeof packet.data === "string" ? packet.data : undefined,
          );
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
   *
   * 从事件数据包中提取事件名称和数据，如果有确认 ID 则创建回调函数，
   * 然后触发相应的事件监听器。
   *
   * @param packet - Socket.IO 事件数据包，包含事件名称和数据
   *
   * @internal
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
   * 当服务器响应客户端发送的带确认的事件时，会收到确认数据包。
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
   * 当服务器发送带确认 ID 的事件时，客户端可以通过此方法发送确认响应。
   *
   * @param id - 确认 ID，与服务器发送的事件数据包中的 ID 对应
   * @param data - 响应数据，会发送给服务器
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
   * 发送连接数据包
   *
   * 在收到服务器的握手数据包后，向服务器发送 CONNECT 数据包以完成连接。
   *
   * @internal
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
   *
   * 将 Socket.IO 数据包编码后通过传输层发送给服务器。
   *
   * @param packet - Socket.IO 数据包对象
   *
   * @internal
   */
  private sendSocketIOPacket(packet: SocketIOPacket): void {
    const encoded = encodePacket(packet);
    this.transport.send({
      type: EnginePacketType.MESSAGE,
      data: encoded,
    });
  }

  /**
   * 向服务器发送事件
   *
   * 如果提供了回调函数，服务器可以通过回调返回响应数据。
   * 如果未连接，事件不会发送。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param data - 事件数据，可以是任意类型
   * @param callback - 确认回调函数（可选），服务器可以通过回调返回响应数据
   *
   * @example
   * ```typescript
   * // 发送简单事件
   * socket.emit("message", { text: "Hello" });
   *
   * // 发送带确认的事件
   * socket.emit("get-user", { id: 123 }, (response) => {
   *   console.log("服务器响应:", response);
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
   * 监听服务器发送的事件
   *
   * 注册一个事件监听器，当服务器发送对应事件时，监听器会被调用。
   * 可以为一个事件注册多个监听器，它们会按注册顺序依次调用。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param listener - 监听器函数，接收事件数据和可选的确认回调作为参数
   *
   * @example
   * ```typescript
   * socket.on("message", (data, callback) => {
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
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
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
   * 监听一次事件（标准 Socket.IO API）
   *
   * 注册一个只执行一次的事件监听器。当事件第一次触发时，监听器会被调用，
   * 然后自动移除，不会再次触发。
   *
   * @param event - 事件名称
   * @param listener - 监听器函数，接收事件数据和可选的确认回调作为参数
   *
   * @example
   * ```typescript
   * // 只监听一次连接事件
   * socket.once("connect", () => {
   *   console.log("首次连接成功");
   * });
   * ```
   */
  once(event: string, listener: SocketEventListener): void {
    const onceWrapper: SocketEventListener = (...args: any[]) => {
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
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * 触发事件（内部使用）
   *
   * 调用指定事件的所有监听器，并传递事件数据和可选的确认回调。
   * 如果监听器执行时抛出错误，会被捕获并记录到控制台，不会影响其他监听器的执行。
   *
   * @param event - 事件名称
   * @param data - 事件数据，会传递给所有监听器
   * @param callback - 确认回调函数（可选），监听器可以通过此回调向服务器发送响应
   *
   * @internal
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
          console.error(`事件监听器错误 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 断开与服务器的连接
   *
   * 断开连接时会：
   * 1. 标记为未连接状态
   * 2. 向服务器发送 DISCONNECT 数据包
   * 3. 关闭传输层
   * 4. 触发 disconnect 事件
   *
   * @param reason - 断开原因（可选），会发送给服务器并传递给 disconnect 事件监听器
   *
   * @example
   * ```typescript
   * socket.disconnect("用户主动断开");
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

    // 关闭传输层
    this.transport.close();

    // 触发断开连接事件
    this.triggerEvent("disconnect", reason);
  }
}
