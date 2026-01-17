/**
 * @fileoverview 客户端传输层抽象类
 * 定义客户端传输层的通用接口
 */

import { EnginePacket } from "../types.ts";

/**
 * 传输层事件监听器
 */
export type ClientTransportEventListener = (packet: EnginePacket) => void;

/**
 * 传输层状态
 */
export enum TransportState {
  /** 未连接 */
  DISCONNECTED = "disconnected",
  /** 连接中 */
  CONNECTING = "connecting",
  /** 已连接 */
  CONNECTED = "connected",
  /** 已关闭 */
  CLOSED = "closed",
}

/**
 * 客户端传输层抽象类
 */
export abstract class ClientTransport {
  /** 传输状态 */
  protected state: TransportState = TransportState.DISCONNECTED;
  /** 事件监听器 */
  protected listeners: Set<ClientTransportEventListener> = new Set();

  /**
   * 连接到服务器
   * @param url 服务器 URL
   * @param sid Socket ID（可选，用于重连）
   */
  abstract connect(url: string, sid?: string): Promise<void>;

  /**
   * 发送数据包
   * @param packet 数据包
   */
  abstract send(packet: EnginePacket): void | Promise<void>;

  /**
   * 关闭传输
   */
  abstract close(): void;

  /**
   * 添加事件监听器
   * @param listener 监听器函数
   */
  on(listener: ClientTransportEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除事件监听器
   * @param listener 监听器函数
   */
  off(listener: ClientTransportEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 触发数据包事件
   * @param packet 数据包
   */
  protected emit(packet: EnginePacket): void {
    for (const listener of this.listeners) {
      try {
        listener(packet);
      } catch {
        // 忽略监听器错误
      }
    }
  }

  /**
   * 获取传输状态
   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state === TransportState.CONNECTED;
  }
}
