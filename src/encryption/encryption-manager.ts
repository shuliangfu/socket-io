/**
 * @fileoverview 消息加密模块
 * 提供消息加密和解密功能，支持客户端加密、服务端自动解密
 */

import { decrypt, encrypt } from "@dreamer/crypto/client";
import { $tr } from "../i18n.ts";
import type { EncryptionConfig } from "../types.ts";

/**
 * 加密缓存项
 */
interface EncryptionCacheItem {
  /** 加密后的消息 */
  encrypted: string;
  /** 缓存时间戳 */
  timestamp: number;
  /** 使用次数 */
  useCount: number;
}

/**
 * 加密管理器
 * 负责消息的加密和解密
 */
export class EncryptionManager {
  /** 加密密钥 */
  private key: Uint8Array;
  /** 加密算法 */
  private algorithm:
    | "aes-256-gcm"
    | "aes-128-gcm"
    | "aes-256-cbc"
    | "aes-128-cbc";
  /** 是否启用加密 */
  private enabled: boolean;
  /** 加密缓存（明文哈希 -> 加密结果） */
  private encryptionCache: Map<string, EncryptionCacheItem> = new Map();
  /** 最大缓存大小 */
  private maxCacheSize: number = 1000;
  /** 缓存过期时间（毫秒） */
  private cacheTTL: number = 60000;

  /**
   * 创建加密管理器
   * @param config 加密配置
   */
  constructor(config: EncryptionConfig) {
    this.enabled = config.enabled !== false;

    // 处理密钥
    if (typeof config.key === "string") {
      // 字符串密钥：转换为 Uint8Array
      this.key = new TextEncoder().encode(config.key);
    } else {
      this.key = config.key;
    }

    // 确保密钥长度正确
    if (this.key.length !== 16 && this.key.length !== 32) {
      throw new Error(
        $tr("errors.keyLengthMustBe16Or32", {
          length: String(this.key.length),
        }),
      );
    }

    // 根据密钥长度确定算法
    if (!config.algorithm) {
      this.algorithm = this.key.length === 16 ? "aes-128-gcm" : "aes-256-gcm";
    } else {
      this.algorithm = config.algorithm;
      // 验证算法和密钥长度匹配
      const requiredLength = config.algorithm.includes("128") ? 16 : 32;
      if (this.key.length !== requiredLength) {
        throw new Error(
          $tr("errors.algorithmKeyLengthMismatch", {
            algorithm: config.algorithm,
            requiredLength: String(requiredLength),
            currentLength: String(this.key.length),
          }),
        );
      }
    }

    // 设置缓存配置（如果提供）
    if (config.cacheSize !== undefined) {
      this.maxCacheSize = config.cacheSize;
    }
    if (config.cacheTTL !== undefined) {
      this.cacheTTL = config.cacheTTL;
    }
  }

  /**
   * 计算明文哈希（用于缓存键）
   * @param plaintext 明文消息
   * @returns 哈希值
   */
  private hashPlaintext(plaintext: string): string {
    // 使用简单的哈希（对于大量连接场景，可以使用更高效的哈希算法）
    return `${this.algorithm}:${plaintext.length}:${plaintext.slice(0, 100)}`;
  }

  /**
   * 加密消息（带缓存）
   * @param plaintext 明文消息（JSON 字符串）
   * @returns 加密后的消息（Base64 编码）
   */
  async encryptMessage(plaintext: string): Promise<string> {
    if (!this.enabled) {
      return plaintext;
    }

    // 检查缓存
    const cacheKey = this.hashPlaintext(plaintext);
    const cached = this.encryptionCache.get(cacheKey);
    if (cached) {
      // 检查是否过期
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        cached.useCount++;
        return cached.encrypted;
      } else {
        // 过期，删除
        this.encryptionCache.delete(cacheKey);
      }
    }

    // 缓存未命中，加密消息
    try {
      const encrypted = await encrypt(plaintext, this.key, this.algorithm);

      // 如果缓存已满，删除最少使用的项
      if (this.encryptionCache.size >= this.maxCacheSize) {
        this.evictLeastUsed();
      }

      // 添加到缓存
      this.encryptionCache.set(cacheKey, {
        encrypted,
        timestamp: Date.now(),
        useCount: 1,
      });

      return encrypted;
    } catch (error) {
      throw new Error(
        $tr("errors.encryptFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  /**
   * 删除最少使用的缓存项
   */
  private evictLeastUsed(): void {
    let leastUsed: { key: string; useCount: number } | null = null;

    for (const [key, cached] of this.encryptionCache.entries()) {
      if (!leastUsed || cached.useCount < leastUsed.useCount) {
        leastUsed = { key, useCount: cached.useCount };
      }
    }

    if (leastUsed) {
      this.encryptionCache.delete(leastUsed.key);
    }
  }

  /**
   * 清理过期缓存
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.encryptionCache.entries()) {
      if (now - cached.timestamp >= this.cacheTTL) {
        this.encryptionCache.delete(key);
      }
    }
  }

  /**
   * 清空加密缓存
   */
  clearCache(): void {
    this.encryptionCache.clear();
  }

  /**
   * 解密消息
   * @param ciphertext 加密消息（Base64 编码）
   * @returns 解密后的消息（JSON 字符串）
   */
  async decryptMessage(ciphertext: string): Promise<string> {
    if (!this.enabled) {
      return ciphertext;
    }

    try {
      return await decrypt(ciphertext, this.key, this.algorithm);
    } catch (error) {
      throw new Error(
        $tr("errors.decryptFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  /**
   * 检查消息是否已加密
   * @param message 消息字符串
   * @returns 是否已加密
   */
  isEncrypted(message: string): boolean {
    // Base64 编码的加密消息通常以特定格式开始
    // 简单检查：尝试 Base64 解码，如果成功且长度合理，可能是加密消息
    try {
      // Base64 字符串通常只包含 A-Z, a-z, 0-9, +, /, = 字符
      const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
      if (!base64Pattern.test(message)) {
        return false;
      }

      // 尝试解码
      const decoded = atob(message);
      // 加密消息通常包含 IV（12 或 16 字节）+ 加密数据
      // 最小长度应该大于 20 字节
      return decoded.length > 20;
    } catch {
      return false;
    }
  }

  /**
   * 生成随机密钥
   * @param algorithm 算法类型（用于确定密钥长度）
   * @returns 随机密钥
   */
  static generateKey(
    algorithm: "aes-128" | "aes-256" = "aes-256",
  ): Uint8Array {
    const keyLength = algorithm === "aes-128" ? 16 : 32;
    const key = new Uint8Array(keyLength);
    globalThis.crypto.getRandomValues(key);
    return key;
  }

  /**
   * 从字符串生成密钥（使用 PBKDF2 或简单哈希）
   * @param password 密码字符串
   * @param algorithm 算法类型
   * @returns 密钥
   */
  static async deriveKeyFromPassword(
    password: string,
    algorithm: "aes-128" | "aes-256" = "aes-256",
  ): Promise<Uint8Array> {
    const keyLength = algorithm === "aes-128" ? 16 : 32;
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    // 使用 SHA-256 哈希生成密钥（简单方法）
    // 对于生产环境，建议使用 PBKDF2
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);

    // 如果密钥长度是 16，只取前 16 字节
    if (keyLength === 16) {
      return hashArray.slice(0, 16);
    }

    return hashArray;
  }
}
