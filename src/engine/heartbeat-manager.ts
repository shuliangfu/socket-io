/**
 * @fileoverview 批量心跳管理器
 * 统一管理所有连接的心跳，批量发送心跳消息
 */

import { EnginePacketType } from "../types.ts";
import { EngineSocket } from "./socket.ts";

/**
 * 批量心跳管理器
 */
export class BatchHeartbeatManager {
  /** Socket 集合 */
  private sockets: Set<EngineSocket> = new Set();
  /** 心跳定时器 */
  private pingTimer: number | null = null;
  /** 心跳间隔（毫秒） */
  private readonly pingInterval: number;
  /** 心跳超时时间（毫秒） */
  private readonly pingTimeout: number;
  /** 是否已启动 */
  private started = false;
  /** 待执行的 setTimeout 定时器集合 */
  private pendingTimeouts: Set<number> = new Set();

  /**
   * 创建批量心跳管理器
   * @param pingInterval 心跳间隔（毫秒，默认：25000）
   * @param pingTimeout 心跳超时时间（毫秒，默认：20000）
   */
  constructor(pingInterval: number = 25000, pingTimeout: number = 20000) {
    this.pingInterval = pingInterval;
    this.pingTimeout = pingTimeout;
  }

  /**
   * 添加 Socket
   * @param socket Engine.IO Socket
   */
  add(socket: EngineSocket): void {
    this.sockets.add(socket);
    if (!this.started && this.sockets.size > 0) {
      this.start();
    }
  }

  /**
   * 移除 Socket
   * @param socket Engine.IO Socket
   */
  remove(socket: EngineSocket): void {
    this.sockets.delete(socket);
    if (this.started && this.sockets.size === 0) {
      this.stop();
    }
  }

  /**
   * 开始批量心跳
   */
  private start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.pingTimer = setInterval(() => {
      this.batchPing();
    }, this.pingInterval) as unknown as number;
  }

  /**
   * 批量发送心跳
   */
  private batchPing(): void {
    const sockets = Array.from(this.sockets).filter(s => s.isConnected());

    if (sockets.length === 0) {
      return;
    }

    // 分批发送，避免阻塞事件循环
    const batchSize = 100;
    for (let i = 0; i < sockets.length; i += batchSize) {
      const batch = sockets.slice(i, i + batchSize);

      // 使用 setTimeout 让出事件循环
      const timeoutId = setTimeout(() => {
        this.pendingTimeouts.delete(timeoutId as unknown as number);
        for (const socket of batch) {
          if (socket.isConnected()) {
            try {
              socket.send({
                type: EnginePacketType.PING,
              });
            } catch (error) {
              // 忽略发送错误，可能是连接已关闭
              console.error("心跳发送错误:", error);
            }
          }
        }
      }, 0) as unknown as number;
      this.pendingTimeouts.add(timeoutId);
    }
  }

  /**
   * 停止批量心跳
   */
  private stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stop();

    // 清除所有待执行的 setTimeout
    for (const timeoutId of this.pendingTimeouts) {
      clearTimeout(timeoutId);
    }
    this.pendingTimeouts.clear();

    this.sockets.clear();
  }

  /**
   * 获取当前管理的 Socket 数量
   */
  get size(): number {
    return this.sockets.size;
  }
}
