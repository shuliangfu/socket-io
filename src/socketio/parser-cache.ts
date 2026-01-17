/**
 * @fileoverview 解析器缓存
 * 缓存解析结果，减少重复解析
 */

import { SocketIOPacket } from "../types.ts";
import { decodePacket } from "./parser.ts";

/**
 * 解析器缓存
 */
export class ParserCache {
  /** 解码缓存 */
  private decodeCache: Map<string, SocketIOPacket> = new Map();
  /** 最大缓存大小 */
  private readonly maxSize: number;
  /** 缓存访问顺序（用于 LRU） */
  private accessOrder: string[] = [];

  /**
   * 创建解析器缓存
   * @param maxSize 最大缓存大小（默认：1000）
   */
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * 解码数据包（带缓存）
   * @param encoded 编码后的字符串
   * @returns 数据包对象
   */
  decode(encoded: string): SocketIOPacket {
    // 检查缓存
    if (this.decodeCache.has(encoded)) {
      // 更新访问顺序（LRU）
      this.updateAccessOrder(encoded);
      return this.decodeCache.get(encoded)!;
    }

    // 解码
    const packet = decodePacket(encoded);

    // 添加到缓存
    if (this.decodeCache.size >= this.maxSize) {
      // 移除最久未使用的项（LRU）
      const oldestKey = this.accessOrder.shift()!;
      this.decodeCache.delete(oldestKey);
    }

    this.decodeCache.set(encoded, packet);
    this.accessOrder.push(encoded);

    return packet;
  }

  /**
   * 更新访问顺序（LRU）
   * @param key 缓存键
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.decodeCache.clear();
    this.accessOrder = [];
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.decodeCache.size;
  }
}
