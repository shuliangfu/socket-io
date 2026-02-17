/**
 * @fileoverview 流式解析器
 * 支持大数据包的流式解析，避免一次性加载整个数据包到内存
 */

import { decodePacket } from "../engine/parser.ts";
import { $t } from "../i18n.ts";
import { EnginePacket, EnginePacketType } from "../types.ts";

/**
 * 流式解析器状态
 */
enum StreamParserState {
  /** 等待数据包类型 */
  WAITING_TYPE,
  /** 等待数据长度 */
  WAITING_LENGTH,
  /** 等待数据内容 */
  WAITING_DATA,
  /** 解析完成 */
  COMPLETE,
}

/**
 * 流式解析器
 * 用于解析可能分块到达的大数据包
 */
export class StreamParser {
  /** 当前状态 */
  private state: StreamParserState = StreamParserState.WAITING_TYPE;
  /** 当前数据包类型 */
  private currentType?: EnginePacketType;
  /** 当前数据长度 */
  private currentLength?: number;
  /** 当前数据缓冲区 */
  private currentData: Uint8Array[] = [];
  /** 已接收的数据长度 */
  private receivedLength = 0;
  /** 最大数据包大小（默认：10MB） */
  private readonly maxPacketSize: number;

  /**
   * 创建流式解析器
   * @param maxPacketSize 最大数据包大小（字节，默认：10MB）
   */
  constructor(maxPacketSize: number = 10 * 1024 * 1024) {
    this.maxPacketSize = maxPacketSize;
  }

  /**
   * 添加数据块
   * @param chunk 数据块
   * @returns 解析完成的数据包数组（如果有）
   */
  addChunk(chunk: Uint8Array): EnginePacket[] {
    const packets: EnginePacket[] = [];
    let offset = 0;

    while (offset < chunk.length) {
      const result = this.processChunk(chunk, offset);
      if (result.packet) {
        packets.push(result.packet);
      }
      offset = result.offset;
    }

    return packets;
  }

  /**
   * 处理数据块
   * @param chunk 数据块
   * @param offset 起始偏移量
   * @returns 处理结果
   */
  private processChunk(
    chunk: Uint8Array,
    offset: number,
  ): { packet?: EnginePacket; offset: number } {
    switch (this.state) {
      case StreamParserState.WAITING_TYPE: {
        // 等待数据包类型（第一个字节）
        if (offset >= chunk.length) {
          return { offset };
        }

        const typeByte = chunk[offset];
        this.currentType = typeByte as EnginePacketType;
        offset++;

        // 检查是否有长度前缀（对于大数据包）
        if (offset < chunk.length) {
          this.state = StreamParserState.WAITING_LENGTH;
          // 继续处理长度（fall through）
        } else {
          // 没有更多数据，等待下一个块
          return { offset };
        }
      }
      // fall through

      case StreamParserState.WAITING_LENGTH: {
        // 等待数据长度（可选，用于大数据包）
        // 简化实现：直接进入等待数据状态
        // 实际实现中，可以根据协议添加长度前缀支持
        this.state = StreamParserState.WAITING_DATA;
        this.currentLength = undefined; // 未知长度，直到遇到分隔符
        this.currentData = [];
        this.receivedLength = 0;
        // 继续处理数据（fall through）
      }
      // fall through

      case StreamParserState.WAITING_DATA: {
        // 等待数据内容
        // 查找数据包结束标记（Engine.IO 协议中，数据包以特定格式结束）
        // 简化实现：假设数据包是完整的字符串，查找换行符或特定结束标记
        const remaining = chunk.slice(offset);
        const text = new TextDecoder().decode(remaining);

        // 尝试解析完整的数据包
        // Engine.IO 数据包格式：type[data]
        // 如果遇到完整的字符串数据包，解析它
        try {
          // 查找可能的数据包结束位置
          // 简化：假设整个剩余数据是一个数据包
          const packetString = String(this.currentType) + text;
          const packet = decodePacket(packetString);

          // 解析成功，重置状态
          this.reset();
          return { packet, offset: chunk.length };
        } catch (_error) {
          // 解析失败，可能是数据不完整，继续累积
          this.currentData.push(remaining);
          this.receivedLength += remaining.length;

          // 检查是否超过最大大小
          if (this.receivedLength > this.maxPacketSize) {
            throw new Error(
              $t("errors.packetSizeExceeded", {
                receivedLength: this.receivedLength,
                maxPacketSize: this.maxPacketSize,
              }),
            );
          }

          return { offset: chunk.length };
        }
      }

      default: {
        return { offset };
      }
    }
  }

  /**
   * 重置解析器状态
   */
  private reset(): void {
    this.state = StreamParserState.WAITING_TYPE;
    this.currentType = undefined;
    this.currentLength = undefined;
    this.currentData = [];
    this.receivedLength = 0;
  }

  /**
   * 重置解析器（用于处理错误或开始新的解析）
   */
  resetParser(): void {
    this.reset();
  }

  /**
   * 获取当前状态
   */
  getState(): StreamParserState {
    return this.state;
  }
}

/**
 * 流式数据包处理器
 * 用于处理可能分块到达的大数据包
 */
export class StreamPacketProcessor {
  /** 流式解析器 */
  private parser: StreamParser;
  /** 数据包回调 */
  private onPacket: (packet: EnginePacket) => void;
  /** 错误回调（可选），解析失败时调用 */
  private onError?: (error: unknown) => void;
  /** 翻译函数（可选，用于错误信息国际化） */
  private readonly tr?: (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean>,
  ) => string;

  /**
   * 创建流式数据包处理器
   * @param onPacket 数据包回调函数
   * @param maxPacketSize 最大数据包大小（字节，默认：10MB）
   * @param onError 错误回调（可选），解析失败时调用，未提供时使用 console.error
   * @param tr 翻译函数（可选），用于错误信息国际化
   */
  constructor(
    onPacket: (packet: EnginePacket) => void,
    maxPacketSize: number = 10 * 1024 * 1024,
    onError?: (error: unknown) => void,
    tr?: (
      key: string,
      fallback: string,
      params?: Record<string, string | number | boolean>,
    ) => string,
  ) {
    this.parser = new StreamParser(maxPacketSize);
    this.onPacket = onPacket;
    this.onError = onError;
    this.tr = tr;
  }

  /**
   * 处理数据块
   * @param chunk 数据块
   */
  processChunk(chunk: Uint8Array): void {
    try {
      const packets = this.parser.addChunk(chunk);
      for (const packet of packets) {
        this.onPacket(packet);
      }
    } catch (error) {
      const msg = this.tr?.(
        "log.socketio.streamParseError",
        $t("log.socketio.streamParseError"),
      ) ?? $t("log.socketio.streamParseError");
      (this.onError ?? ((e: unknown) => console.error(msg, e)))(error);
      this.parser.resetParser();
    }
  }

  /**
   * 重置处理器
   */
  reset(): void {
    this.parser.resetParser();
  }
}
