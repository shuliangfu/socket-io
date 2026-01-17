/**
 * @fileoverview 智能重连策略
 * 智能重连策略，减少无效重连
 */

/**
 * 智能重连管理器
 */
export class SmartReconnection {
  /** 重连尝试次数 */
  private reconnectAttempts = 0;
  /** 最后错误时间 */
  private lastErrorTime = 0;
  /** 连续错误次数 */
  private consecutiveErrors = 0;
  /** 最大重连延迟（毫秒） */
  private readonly maxDelay: number;
  /** 基础重连延迟（毫秒） */
  private readonly baseDelay: number;

  /**
   * 创建智能重连管理器
   * @param baseDelay 基础重连延迟（毫秒，默认：1000）
   * @param maxDelay 最大重连延迟（毫秒，默认：30000）
   */
  constructor(baseDelay: number = 1000, maxDelay: number = 30000) {
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }

  /**
   * 记录连接成功
   */
  onSuccess(): void {
    this.reconnectAttempts = 0;
    this.consecutiveErrors = 0;
    this.lastErrorTime = 0;
  }

  /**
   * 记录连接错误
   */
  onError(): void {
    this.consecutiveErrors++;
    this.lastErrorTime = Date.now();
    this.reconnectAttempts++;
  }

  /**
   * 计算重连延迟
   * @returns 重连延迟（毫秒）
   */
  calculateDelay(): number {
    // 如果连续错误太多，延长等待时间
    if (this.consecutiveErrors > 10) {
      const timeSinceLastError = Date.now() - this.lastErrorTime;
      if (timeSinceLastError < 60000) {
        // 等待 1 分钟
        return 60000 - timeSinceLastError;
      }
    }

    // 指数退避 + 抖动
    const baseDelay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxDelay,
    );
    const jitter = Math.random() * 1000; // 0-1秒随机抖动
    return baseDelay + jitter;
  }

  /**
   * 检查是否应该重连
   * @returns 是否应该重连
   */
  shouldReconnect(): boolean {
    // 如果连续错误太多，延长等待时间
    if (this.consecutiveErrors > 10) {
      const timeSinceLastError = Date.now() - this.lastErrorTime;
      return timeSinceLastError > 60000; // 等待 1 分钟
    }
    return true;
  }

  /**
   * 重置重连状态
   */
  reset(): void {
    this.reconnectAttempts = 0;
    this.consecutiveErrors = 0;
    this.lastErrorTime = 0;
  }

  /**
   * 获取重连尝试次数
   */
  get attempts(): number {
    return this.reconnectAttempts;
  }
}
