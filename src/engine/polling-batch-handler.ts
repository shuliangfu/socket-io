/**
 * @fileoverview 批量轮询处理器
 * 批量处理多个轮询请求，减少 HTTP 连接数
 */

/**
 * 轮询请求
 */
interface PollingRequest {
  sid: string;
  resolve: (response: Response) => void;
  timestamp: number;
}

/**
 * 批量轮询处理器
 */
export class PollingBatchHandler {
  /** 待处理的轮询请求 */
  private pendingPolls: Map<string, PollingRequest> = new Map();
  /** 批量处理定时器 */
  private batchTimer: number | null = null;
  /** 批量处理间隔（毫秒） */
  private readonly batchInterval: number;
  /** 最大等待时间（毫秒） */
  private readonly maxWaitTime: number;
  /** 处理函数 */
  private processor: (sids: string[]) => Promise<Map<string, Response>>;

  /**
   * 创建批量轮询处理器
   * @param processor 处理函数，接收 Socket ID 数组，返回响应映射
   * @param batchInterval 批量处理间隔（毫秒，默认：50）
   * @param maxWaitTime 最大等待时间（毫秒，默认：100）
   */
  constructor(
    processor: (sids: string[]) => Promise<Map<string, Response>>,
    batchInterval: number = 50,
    maxWaitTime: number = 100,
  ) {
    this.processor = processor;
    this.batchInterval = batchInterval;
    this.maxWaitTime = maxWaitTime;
  }

  /**
   * 添加轮询请求
   * @param sid Socket ID
   * @param resolve 响应回调
   */
  addPoll(sid: string, resolve: (response: Response) => void): void {
    this.pendingPolls.set(sid, {
      sid,
      resolve,
      timestamp: Date.now(),
    });
    this.scheduleBatch();
  }

  /**
   * 移除轮询请求
   * @param sid Socket ID
   */
  removePoll(sid: string): void {
    this.pendingPolls.delete(sid);
  }

  /**
   * 调度批量处理
   */
  private scheduleBatch(): void {
    if (this.batchTimer) {
      return;
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
      this.batchTimer = null;
    }, this.batchInterval) as unknown as number;
  }

  /**
   * 批量处理轮询请求
   */
  private async processBatch(): Promise<void> {
    if (this.pendingPolls.size === 0) {
      return;
    }

    // 获取所有待处理的请求
    const requests = Array.from(this.pendingPolls.values());

    // 处理所有请求
    if (requests.length > 0) {
      const sids = requests.map((req) => req.sid);
      const responses = await this.processor(sids);

      // 发送响应
      for (const req of requests) {
        const response = responses.get(req.sid);
        if (response) {
          req.resolve(response);
          this.pendingPolls.delete(req.sid);
        }
      }
    }
  }

  /**
   * 清空所有待处理的请求
   */
  clear(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // 清空所有待处理的请求，并返回关闭数据包响应
    for (const request of this.pendingPolls.values()) {
      // 发送关闭数据包，让客户端知道连接已关闭
      // Engine.IO CLOSE 数据包格式: "1:1"
      const closePacket = "1:1";
      request.resolve(
        new Response(closePacket, {
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
        }),
      );
    }
    this.pendingPolls.clear();
  }
}
