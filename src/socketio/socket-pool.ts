/**
 * @fileoverview Socket 对象池
 * 复用 Socket 对象，减少对象创建和销毁开销
 */

import type { Logger } from "@dreamer/logger";
import type { Server } from "../server.ts";
import { EngineSocket } from "../engine/socket.ts";
import { SocketIOSocket } from "./socket.ts";

/**
 * Socket 对象池
 */
export class SocketPool {
  /** 对象池 */
  private pool: SocketIOSocket[] = [];
  /** 最大池大小 */
  private readonly maxSize: number;
  /** 当前活跃的 Socket 数量 */
  private activeCount = 0;
  /** Logger 实例（用于 Socket 统一日志） */
  private readonly logger?: Logger;
  /** Server 实例（用于 Socket.getServer()） */
  private readonly server?: Server;

  /**
   * 创建 Socket 对象池
   * @param maxSize 最大池大小（默认：1000）
   * @param logger Logger 实例（可选），用于 Socket 统一日志输出
   * @param server Server 实例（可选），用于 Socket.getServer() 与 websocket 对齐
   */
  constructor(maxSize: number = 1000, logger?: Logger, server?: Server) {
    this.maxSize = maxSize;
    this.logger = logger;
    this.server = server;
  }

  /**
   * 获取 Socket 对象
   * @param engineSocket Engine.IO Socket
   * @param nsp 命名空间
   * @returns Socket.IO Socket
   */
  acquire(engineSocket: EngineSocket, nsp: string): SocketIOSocket {
    let socket: SocketIOSocket;

    if (this.pool.length > 0) {
      // 从池中获取
      socket = this.pool.pop()!;
      socket.reset(engineSocket, nsp);
    } else {
      // 创建新的 Socket
      socket = new SocketIOSocket(engineSocket, nsp, this.logger, this.server);
    }

    this.activeCount++;
    return socket;
  }

  /**
   * 释放 Socket 对象
   * @param socket Socket.IO Socket
   */
  release(socket: SocketIOSocket): void {
    if (this.pool.length < this.maxSize) {
      // 清理 Socket 状态
      socket.cleanup();
      this.pool.push(socket);
    }
    // 如果池已满，让 Socket 被垃圾回收

    this.activeCount--;
  }

  /**
   * 获取池大小
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * 获取活跃 Socket 数量
   */
  get active(): number {
    return this.activeCount;
  }

  /**
   * 清空对象池
   */
  clear(): void {
    this.pool = [];
    this.activeCount = 0;
  }
}
