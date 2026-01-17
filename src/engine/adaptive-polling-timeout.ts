/**
 * @fileoverview 动态轮询超时
 * 根据连接数自适应调整轮询超时时间
 */

/**
 * 动态轮询超时管理器
 */
export class AdaptivePollingTimeout {
  /** 基础超时时间（毫秒） */
  private readonly baseTimeout: number;
  /** 当前连接数 */
  private currentConnections = 0;

  /**
   * 创建动态轮询超时管理器
   * @param baseTimeout 基础超时时间（毫秒，默认：60000）
   */
  constructor(baseTimeout: number = 60000) {
    this.baseTimeout = baseTimeout;
  }

  /**
   * 更新连接数
   * @param count 连接数
   */
  updateConnections(count: number): void {
    this.currentConnections = count;
  }

  /**
   * 根据连接数计算超时时间
   * @returns 超时时间（毫秒）
   */
  getTimeout(): number {
    // 连接数越多，超时时间越短，减少资源占用
    if (this.currentConnections > 10000) {
      return this.baseTimeout / 2; // 30秒
    } else if (this.currentConnections > 5000) {
      return this.baseTimeout * 0.75; // 45秒
    } else if (this.currentConnections > 1000) {
      return this.baseTimeout * 0.9; // 54秒
    }
    return this.baseTimeout; // 60秒
  }

  /**
   * 获取当前连接数
   */
  get connections(): number {
    return this.currentConnections;
  }
}
