/**
 * @fileoverview Engine.IO 传输层抽象类
 * 定义传输层的通用接口
 */

import type { Logger } from "@dreamer/logger";
import { $t } from "../i18n.ts";
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
  /** Logger 实例（可选） */
  protected logger?: Logger;

  /**
   * 创建传输层
   * @param logger Logger 实例（可选），用于统一日志输出
   */
  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * 发送数据包
   * @param packet 数据包
   */
  abstract send(packet: EnginePacket): void | Promise<void>;

  /**
   * 关闭传输
   * 子类实现时应在最后调用 clearListeners() 以释放监听器引用，防止内存泄漏
   */
  abstract close(): void;

  /**
   * 清空事件监听器
   * 在 close() 时调用，释放监听器引用，防止循环引用导致的内存泄漏
   */
  protected clearListeners(): void {
    this.listeners.clear();
  }

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
        const msg = $t("log.socketioEngine.transportListenerError");
        (this.logger?.error ?? console.error)(msg, error);
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
