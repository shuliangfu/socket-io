/**
 * @fileoverview 消息压缩管理器
 * 使用 gzip/deflate 压缩消息，减少网络传输量
 */

import type { Logger } from "@dreamer/logger";

/**
 * 压缩算法类型
 */
export type CompressionAlgorithm = "gzip" | "deflate";

/**
 * 压缩管理器配置
 */
export interface CompressionManagerOptions {
  /** 压缩算法（默认：gzip） */
  algorithm?: CompressionAlgorithm;
  /** 最小压缩大小（字节，小于此大小的消息不压缩，默认：1024） */
  minSize?: number;
  /** 压缩级别（1-9，默认：6） */
  level?: number;
  /** Logger 实例（可选），用于统一日志输出 */
  logger?: Logger;
  /** 翻译函数（可选），用于错误信息国际化 */
  tr?: (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean>,
  ) => string;
}

/**
 * 压缩管理器
 * 使用原生 CompressionStream API（Deno/Bun 支持）
 */
export class CompressionManager {
  /** 压缩算法 */
  private readonly algorithm: CompressionAlgorithm;
  /** 最小压缩大小（字节） */
  private readonly minSize: number;
  /** 是否启用压缩 */
  private enabled: boolean;
  /** Logger 实例（可选） */
  private readonly logger?: Logger;
  /** 翻译函数（可选，用于 i18n） */
  private readonly tr?: (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean>,
  ) => string;

  /**
   * 创建压缩管理器
   * @param options 配置选项
   */
  constructor(options: CompressionManagerOptions = {}) {
    this.algorithm = options.algorithm || "gzip";
    this.minSize = options.minSize || 1024;
    this.enabled = true;
    this.logger = options.logger;
    this.tr = options.tr;

    // 检查是否支持压缩 API
    if (typeof CompressionStream === "undefined") {
      const msg = this.tr?.(
        "log.socketio.compressionUnavailable",
        "CompressionStream API 不可用，压缩功能将被禁用。请使用 Deno 1.37+ 或 Bun 1.0+",
      ) ?? "CompressionStream API 不可用，压缩功能将被禁用。请使用 Deno 1.37+ 或 Bun 1.0+";
      (this.logger?.warn ?? console.warn)(msg);
      this.enabled = false;
    }
  }

  /**
   * 压缩数据
   * @param data 原始数据（字符串或 Uint8Array）
   * @returns 压缩后的数据（Uint8Array）
   */
  async compress(data: string | Uint8Array): Promise<Uint8Array> {
    if (!this.enabled) {
      // 如果压缩不可用，返回原始数据
      if (typeof data === "string") {
        return new TextEncoder().encode(data);
      }
      return data;
    }

    // 如果数据太小，不压缩
    const dataSize = typeof data === "string"
      ? new TextEncoder().encode(data).length
      : data.length;
    if (dataSize < this.minSize) {
      if (typeof data === "string") {
        return new TextEncoder().encode(data);
      }
      return data;
    }

    try {
      // 转换为 Uint8Array
      const input = typeof data === "string"
        ? new TextEncoder().encode(data)
        : data;

      // 使用 CompressionStream 压缩
      const stream = new CompressionStream(this.algorithm);
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      // 写入数据（确保是 Uint8Array，且基于 ArrayBuffer 而不是 SharedArrayBuffer）
      // 创建一个新的 Uint8Array，从原始数据复制，确保 buffer 是 ArrayBuffer 类型
      let bufferToWrite: Uint8Array;
      if (input instanceof Uint8Array) {
        // 如果 buffer 是 ArrayBuffer，直接使用；否则创建新的副本
        if (input.buffer instanceof ArrayBuffer) {
          bufferToWrite = input;
        } else {
          // 从 SharedArrayBuffer 复制到新的 ArrayBuffer
          bufferToWrite = new Uint8Array(input);
        }
      } else {
        bufferToWrite = new Uint8Array(input);
      }
      // bufferToWrite 已确保是基于 ArrayBuffer 的 Uint8Array，使用 BufferSource 断言以兼容严格类型检查
      await writer.write(bufferToWrite as BufferSource);
      await writer.close();

      // 读取压缩后的数据
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }

      // 合并所有块
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error) {
      const msg = this.tr?.(
        "log.socketio.compressionFailed",
        "压缩失败",
      ) ?? "压缩失败";
      (this.logger?.error ?? console.error)(msg, error);
      // 压缩失败，返回原始数据
      if (typeof data === "string") {
        return new TextEncoder().encode(data);
      }
      return data;
    }
  }

  /**
   * 解压数据
   * @param data 压缩后的数据（Uint8Array）
   * @returns 解压后的数据（字符串）
   */
  async decompress(data: Uint8Array): Promise<string> {
    if (!this.enabled) {
      // 如果压缩不可用，直接解码
      return new TextDecoder().decode(data);
    }

    // 先检查数据是否已压缩，如果未压缩则直接解码，避免不必要的错误
    if (!this.isCompressed(data)) {
      return new TextDecoder().decode(data);
    }

    try {
      // 使用 DecompressionStream 解压
      const stream = new DecompressionStream(this.algorithm);
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      // 写入压缩数据（确保是 Uint8Array，且基于 ArrayBuffer 而不是 SharedArrayBuffer）
      // 创建一个新的 Uint8Array，从原始数据复制，确保 buffer 是 ArrayBuffer 类型
      let bufferToWrite: Uint8Array;
      if (data instanceof Uint8Array) {
        // 如果 buffer 是 ArrayBuffer，直接使用；否则创建新的副本
        if (data.buffer instanceof ArrayBuffer) {
          bufferToWrite = data;
        } else {
          // 从 SharedArrayBuffer 复制到新的 ArrayBuffer
          bufferToWrite = new Uint8Array(data);
        }
      } else {
        bufferToWrite = new Uint8Array(data);
      }
      // bufferToWrite 已确保是基于 ArrayBuffer 的 Uint8Array，使用 BufferSource 断言以兼容严格类型检查
      await writer.write(bufferToWrite as BufferSource);
      await writer.close();

      // 读取解压后的数据
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }

      // 合并所有块并解码为字符串
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return new TextDecoder().decode(result);
    } catch {
      // 解压失败，尝试直接解码（可能数据未压缩或压缩格式不匹配）
      // 不输出错误日志，因为可能是正常的未压缩数据
      return new TextDecoder().decode(data);
    }
  }

  /**
   * 检查数据是否已压缩
   * @param data 数据
   * @returns 是否已压缩
   */
  isCompressed(data: Uint8Array): boolean {
    // 检查 gzip 或 deflate 魔数
    // gzip: 1F 8B
    // deflate: 78 9C (zlib header)
    if (data.length < 2) {
      return false;
    }
    return (
      (data[0] === 0x1F && data[1] === 0x8B) || // gzip
      (data[0] === 0x78 &&
        (data[1] === 0x9C || data[1] === 0x01 || data[1] === 0xDA ||
          data[1] === 0x5E)) // deflate/zlib
    );
  }

  /**
   * 启用或禁用压缩
   * @param enabled 是否启用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled && typeof CompressionStream !== "undefined";
  }

  /**
   * 检查压缩是否可用
   */
  get available(): boolean {
    return typeof CompressionStream !== "undefined";
  }
}
