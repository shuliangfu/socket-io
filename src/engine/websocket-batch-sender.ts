/**
 * @fileoverview WebSocket 批量发送器
 * 批量发送 WebSocket 帧，减少系统调用
 */

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

  /**
   * 创建 WebSocket 批量发送器
   * @param batchSize 批量处理大小（默认：100）
   */
  constructor(batchSize: number = 100) {
    this.batchSize = batchSize;
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
            console.error("WebSocket 发送错误:", error);
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
