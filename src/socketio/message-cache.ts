/**
 * @fileoverview 消息序列化缓存
 * 对于相同消息，只序列化一次，然后复用结果
 */

import { SocketIOPacket } from "../types.ts";
import { encodePacket } from "./parser.ts";
import type { HardwareAccelerator } from "../hardware-accel/accelerator.ts";

/**
 * 消息序列化缓存
 */
export class MessageCache {
  /** 缓存映射 */
  private cache: Map<string, string> = new Map();
  /** 最大缓存大小 */
  private readonly maxSize: number;
  /** 缓存访问顺序（用于 LRU） */
  private accessOrder: string[] = [];
  /** 硬件加速器（可选，用于加速哈希计算） */
  private accelerator?: HardwareAccelerator;

  /**
   * 创建消息缓存
   * @param maxSize 最大缓存大小（默认：1000）
   * @param accelerator 硬件加速器（可选，用于加速哈希计算）
   */
  constructor(maxSize: number = 1000, accelerator?: HardwareAccelerator) {
    this.maxSize = maxSize;
    this.accelerator = accelerator;
  }

  /**
   * 获取或创建序列化消息
   * @param packet Socket.IO 数据包
   * @returns 序列化后的字符串
   */
  getOrCreate(packet: SocketIOPacket): string {
    // 生成缓存键
    const key = this.generateKey(packet);

    // 检查缓存
    if (this.cache.has(key)) {
      // 更新访问顺序（LRU）
      this.updateAccessOrder(key);
      return this.cache.get(key)!;
    }

    // 序列化消息
    const encoded = encodePacket(packet);

    // 添加到缓存
    if (this.cache.size >= this.maxSize) {
      // 移除最久未使用的项（LRU）
      const oldestKey = this.accessOrder.shift()!;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, encoded);
    this.accessOrder.push(key);

    return encoded;
  }

  /**
   * 生成缓存键
   * @param packet Socket.IO 数据包
   * @returns 缓存键
   */
  private generateKey(packet: SocketIOPacket): string {
    // 使用数据包的关键信息生成键
    const keyParts = [
      packet.type,
      packet.nsp || "/",
      packet.id !== undefined ? String(packet.id) : "",
      packet.attachments !== undefined ? String(packet.attachments) : "",
      JSON.stringify(packet.data),
    ];
    const keyString = keyParts.join("|");

    // 如果启用硬件加速，使用加速器计算哈希（更高效）
    if (this.accelerator) {
      const encoder = new TextEncoder();
      const data = encoder.encode(keyString);
      // 使用简化的哈希（实际可以使用加速器的批量哈希）
      return this.simpleHash(data).toString(36);
    }

    return keyString;
  }

  /**
   * 简单哈希函数（用于生成缓存键）
   */
  private simpleHash(data: Uint8Array): number {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data[i];
      hash = hash & hash; // 转换为 32 位整数
    }
    return hash;
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
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }
}
