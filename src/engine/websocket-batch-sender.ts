/**
 * @fileoverview WebSocket 批量发送器
 * 批量发送 WebSocket 帧，减少系统调用
 */

import type { Logger } from "@dreamer/logger";
import { $tr } from "../i18n.ts";
import type { Locale } from "../i18n.ts";

/**
 * WebSocket 发送任务
 */
interface WebSocketTask {
  ws: WebSocket;
  data: string | Uint8Array;
  priority: number;
}

/**
 * WebSocket 批量发送器
 */
export class WebSocketBatchSender {
  /** 发送队列 */
  private queue: WebSocketTask[] = [];
  /** 是否正在处理 */
  private processing = false;
  /** 批量处理大小 */
  private readonly batchSize: number;
  /** Logger 实例（可选） */
  private logger?: Logger;
  /** 语言（可选），用于 $t */
  private lang?: Locale;

  /**
   * 创建 WebSocket 批量发送器
   * @param batchSize 批量处理大小（默认：100）
   * @param logger Logger 实例（可选），用于统一日志输出
   */
  constructor(batchSize: number = 100, logger?: Logger) {
    this.batchSize = batchSize;
    this.logger = logger;
  }

  /**
   * 设置 Logger（用于静态实例，由 WebSocketTransport 在首次创建时调用）
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * 设置语言（用于静态实例，由 WebSocketTransport 在首次创建时调用）
   */
  setLang(lang: Locale): void {
    this.lang = lang;
  }

  /**
   * 添加发送任务
   * @param ws WebSocket
   * @param data 数据
   * @param priority 优先级（默认：0）
   */
  add(ws: WebSocket, data: string | Uint8Array, priority: number = 0): void {
    this.queue.push({ ws, data, priority });
    this.process();
  }

  /**
   * 批量处理发送任务
   */
  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // 获取一批任务
      const batch = this.queue.splice(0, this.batchSize);

      // 批量发送
      for (const task of batch) {
        if (task.ws.readyState === WebSocket.OPEN) {
          try {
            task.ws.send(task.data);
          } catch (error) {
            // 忽略发送错误（可能是连接已关闭）
            const msg = $tr("log.socketioEngine.wsSendError");
            (this.logger?.error ?? console.error)(msg, error);
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
