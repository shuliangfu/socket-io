/**
 * @fileoverview 消息队列系统
 * 缓冲和批量处理消息，提高吞吐量
 */

import type { Logger } from "@dreamer/logger";
import { SocketIOSocket } from "./socket.ts";

/**
 * 消息任务
 */
interface MessageTask {
  socket: SocketIOSocket;
  encoded: string;
  priority: number; // 优先级，数字越小优先级越高
}

/**
 * 消息队列
 */
export class MessageQueue {
  /** 消息队列 */
  private queue: MessageTask[] = [];
  /** 最大队列大小 */
  private readonly maxSize: number;
  /** 是否正在处理 */
  private processing = false;
  /** 批量处理大小 */
  private readonly batchSize: number;
  /** Logger 实例（可选） */
  private readonly logger?: Logger;

  /**
   * 创建消息队列
   * @param maxSize 最大队列大小（默认：10000）
   * @param batchSize 批量处理大小（默认：100）
   * @param logger Logger 实例（可选），用于统一日志输出
   */
  constructor(
    maxSize: number = 10000,
    batchSize: number = 100,
    logger?: Logger,
  ) {
    this.maxSize = maxSize;
    this.batchSize = batchSize;
    this.logger = logger;
  }

  /**
   * 添加消息到队列
   * @param socket Socket
   * @param encoded 已编码的消息
   * @param priority 优先级（默认：0）
   */
  enqueue(socket: SocketIOSocket, encoded: string, priority: number = 0): void {
    // 如果队列已满，移除最旧的低优先级消息
    if (this.queue.length >= this.maxSize) {
      // 找到优先级最低的消息
      let lowestPriorityIndex = -1;
      let lowestPriority = Infinity;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].priority > lowestPriority) {
          lowestPriority = this.queue[i].priority;
          lowestPriorityIndex = i;
        }
      }

      // 如果新消息优先级更高，替换低优先级消息
      if (lowestPriorityIndex !== -1 && priority < lowestPriority) {
        this.queue.splice(lowestPriorityIndex, 1);
      } else {
        // 否则移除最旧的消息
        this.queue.shift();
      }
    }

    // 按优先级插入（优先级高的在前面）
    const task: MessageTask = { socket, encoded, priority };
    const insertIndex = this.queue.findIndex((t) => t.priority > priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    // 开始处理
    this.process();
  }

  /**
   * 处理队列中的消息
   */
  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // 获取一批消息
      const batch = this.queue.splice(0, this.batchSize);

      // 批量发送
      for (const task of batch) {
        if (task.socket.connected) {
          try {
            task.socket.sendRaw(task.encoded);
          } catch (error) {
            // 忽略发送错误（可能是连接已关闭）
            (this.logger?.error ?? console.error)("消息发送错误:", error);
          }
        }
      }

      // 让出事件循环
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    this.processing = false;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * 获取队列大小
   */
  get size(): number {
    return this.queue.length;
  }
}
