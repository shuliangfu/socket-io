/**
 * @fileoverview Engine.IO 传输层抽象类
 * 定义传输层的通用接口
 */

import { EnginePacket } from "../types.ts";

/**
 * 传输层事件监听器
 */
export type TransportEventListener = (packet: EnginePacket) => void;

/**
 * 传输层抽象类
 */
export abstract class Transport {
  /** 是否已关闭 */
  protected closed = false;
  /** 事件监听器 */
  protected listeners: Set<TransportEventListener> = new Set();
  /** 待发送的数据包队列 */
  protected sendQueue: EnginePacket[] = [];

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
  on(listener: TransportEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除事件监听器
   * @param listener 监听器函数
   */
  off(listener: TransportEventListener): void {
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
      } catch (error) {
        console.error("传输层事件监听器错误:", error);
      }
    }
  }

  /**
   * 检查是否已关闭
   */
  isClosed(): boolean {
    return this.closed;
  }
}
