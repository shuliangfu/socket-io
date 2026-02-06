/**
 * @fileoverview WebSocket 传输层实现
 * 使用 WebSocket 作为传输方式
 */

import type { Logger } from "@dreamer/logger";
import { EnginePacket, EnginePacketType } from "../types.ts";
import { decodePacket, encodePacket } from "./parser.ts";
import { Transport } from "./transport.ts";
import { WebSocketBatchSender } from "./websocket-batch-sender.ts";
import type { CompressionManager } from "../compression/compression-manager.ts";
import type { EncryptionManager } from "../encryption/encryption-manager.ts";

/**
 * WebSocket 传输层
 */
export class WebSocketTransport extends Transport {
  /** WebSocket 连接 */
  private ws: WebSocket;
  /** WebSocket 批量发送器 */
  private static batchSender: WebSocketBatchSender = new WebSocketBatchSender(100);
  /** 压缩管理器（可选） */
  private compressionManager?: CompressionManager;
  /** 加密管理器（可选） */
  private encryptionManager?: EncryptionManager;

  /**
   * 创建 WebSocket 传输层
   * @param ws WebSocket 连接
   * @param compressionManager 压缩管理器（可选）
   * @param encryptionManager 加密管理器（可选）
   * @param logger Logger 实例（可选），用于统一日志输出
   */
  constructor(
    ws: WebSocket,
    compressionManager?: CompressionManager,
    encryptionManager?: EncryptionManager,
    logger?: Logger,
  ) {
    super(logger);
    this.ws = ws;
    this.compressionManager = compressionManager;
    this.encryptionManager = encryptionManager;
    // 将 logger 传递给静态 batchSender（首次创建时设置）
    if (logger) {
      WebSocketTransport.batchSender.setLogger(logger);
    }
    this.setupListeners();
  }

  /**
   * 设置 WebSocket 事件监听器
   */
  private setupListeners(): void {
    // 监听消息
    this.ws.addEventListener("message", async (event) => {
      try {
        let data: string;

        // 处理二进制消息（可能是压缩的）
        if (event.data instanceof ArrayBuffer || event.data instanceof Uint8Array) {
          const bytes = event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : event.data;

          // 检查是否压缩
          if (this.compressionManager && this.compressionManager.isCompressed(bytes)) {
            data = await this.compressionManager.decompress(bytes);
          } else {
            data = new TextDecoder().decode(bytes);
          }
        } else {
          data = typeof event.data === "string" ? event.data : String(event.data);
        }

        // 如果启用加密，尝试解密
        if (this.encryptionManager) {
          try {
            // 检查是否是加密消息
            if (this.encryptionManager.isEncrypted(data)) {
              data = await this.encryptionManager.decryptMessage(data);
            }
          } catch (error) {
            // 解密失败，可能是未加密的消息或密钥不匹配
            // 如果是加密消息但解密失败，记录错误
            if (this.encryptionManager.isEncrypted(data)) {
              (this.logger?.error ?? console.error)("消息解密失败:", error);
              this.emit({
                type: EnginePacketType.CLOSE,
                data: "解密错误",
              });
              return;
            }
            // 不是加密消息，继续使用原始数据
          }
        }

        const packet = decodePacket(data);
        this.emit(packet);
      } catch (error) {
        (this.logger?.error ?? console.error)("WebSocket 消息解析错误:", error);
        this.emit({
          type: EnginePacketType.CLOSE,
          data: "解析错误",
        });
      }
    });

    // 监听关闭
    this.ws.addEventListener("close", () => {
      this.closed = true;
      this.emit({
        type: EnginePacketType.CLOSE,
      });
    });

    // 监听错误
    this.ws.addEventListener("error", (error) => {
      (this.logger?.error ?? console.error)("WebSocket 错误:", error);
      this.closed = true;
      this.emit({
        type: EnginePacketType.CLOSE,
        data: "WebSocket 错误",
      });
    });
  }

  /**
   * 发送数据包
   * @param packet 数据包
   */
  async send(packet: EnginePacket): Promise<void> {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      let encoded = encodePacket(packet);

      // 如果启用加密，只加密 MESSAGE 类型的数据包（包含 Socket.IO 数据包）
      // OPEN、CLOSE、PING、PONG 等控制数据包不加密
      if (this.encryptionManager && packet.type === EnginePacketType.MESSAGE) {
        encoded = await this.encryptionManager.encryptMessage(encoded);
      }

      // 如果启用压缩，压缩消息
      if (this.compressionManager) {
        const compressed = await this.compressionManager.compress(encoded);
        // 使用批量发送器发送压缩后的二进制数据
        WebSocketTransport.batchSender.add(this.ws, compressed, 0);
      } else {
        // 使用批量发送器发送原始字符串
        WebSocketTransport.batchSender.add(this.ws, encoded, 0);
      }
    } catch (error) {
      (this.logger?.error ?? console.error)("WebSocket 发送错误:", error);
      this.closed = true;
      this.emit({
        type: EnginePacketType.CLOSE,
        data: "发送错误",
      });
    }
  }

  /**
   * 关闭传输
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    if (
      this.ws.readyState === WebSocket.OPEN ||
      this.ws.readyState === WebSocket.CONNECTING
    ) {
      this.ws.close();
    }
  }
}
