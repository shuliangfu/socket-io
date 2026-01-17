/**
 * @fileoverview 客户端消息队列
 * 离线时缓存消息，连接恢复后自动发送
 */

/**
 * 客户端消息任务
 */
interface ClientMessageTask {
  event: string;
  data: any;
  timestamp: number;
}

/**
 * 客户端消息队列
 */
export class ClientMessageQueue {
  /** 消息队列 */
  private queue: ClientMessageTask[] = [];
  /** 最大队列大小 */
  private readonly maxSize: number;
  /** 最大消息年龄（毫秒） */
  private readonly maxAge: number;

  /**
   * 创建客户端消息队列
   * @param maxSize 最大队列大小（默认：1000）
   * @param maxAge 最大消息年龄（毫秒，默认：60000）
   */
  constructor(maxSize: number = 1000, maxAge: number = 60000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  /**
   * 添加消息到队列
   * @param event 事件名称
   * @param data 事件数据
   */
  enqueue(event: string, data: any): void {
    // 如果队列已满，移除最旧的消息
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }

    this.queue.push({
      event,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * 发送队列中的消息
   * @param emit 发送函数
   * @returns 发送的消息数量
   */
  flush(emit: (event: string, data: any) => void): number {
    const now = Date.now();
    let sentCount = 0;

    while (this.queue.length > 0) {
      const message = this.queue[0];

      // 检查消息是否过期
      if (now - message.timestamp > this.maxAge) {
        this.queue.shift();
        continue;
      }

      // 发送消息
      try {
        emit(message.event, message.data);
        this.queue.shift();
        sentCount++;
      } catch {
        // 如果发送失败，保留消息
        break;
      }
    }

    return sentCount;
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
