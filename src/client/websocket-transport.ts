/**
 * @fileoverview 客户端 WebSocket 传输层实现
 * 使用 WebSocket 作为传输方式
 */

import { EnginePacket, EnginePacketType } from "../types.ts";
import { decodePacket, encodePacket } from "../engine/parser.ts";
import { ClientTransport, TransportState } from "./transport.ts";
import type { EncryptionManager } from "../encryption/encryption-manager.ts";

/**
 * 客户端 WebSocket 传输层
 */
export class ClientWebSocketTransport extends ClientTransport {
  /** WebSocket 连接 */
  private ws: WebSocket | null = null;
  /** 服务器 URL */
  private url: string = "";
  /** Socket ID */
  private sid: string = "";
  /** 加密管理器（可选） */
  private encryptionManager?: EncryptionManager;

  /**
   * 创建客户端 WebSocket 传输层
   * @param encryptionManager 加密管理器（可选）
   */
  constructor(encryptionManager?: EncryptionManager) {
    super();
    this.encryptionManager = encryptionManager;
  }

  /**
   * 连接到服务器
   * @param url 服务器 URL
   * @param sid Socket ID（可选，用于重连）
   */
  async connect(url: string, sid?: string): Promise<void> {
    this.url = url;
    this.sid = sid || "";

    // 如果没有 sid，先通过 HTTP 握手获取
    if (!this.sid) {
      try {
        const handshakeUrl = new URL(url);
        handshakeUrl.pathname = handshakeUrl.pathname || "/socket.io/";
        if (!handshakeUrl.pathname.endsWith("/")) {
          handshakeUrl.pathname += "/";
        }

        const response = await fetch(handshakeUrl.toString(), {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error(`握手失败: ${response.status}`);
        }

        const handshake = await response.json();
        this.sid = handshake.sid;
      } catch (error) {
        throw new Error(`WebSocket 握手失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.state === TransportState.CONNECTED && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.state = TransportState.CONNECTING;

    return new Promise((resolve, reject) => {
      try {
        // 构建 WebSocket URL
        const wsUrl = this.buildWebSocketUrl();

        // 创建 WebSocket 连接
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        // 连接打开
        ws.onopen = () => {
          this.state = TransportState.CONNECTED;
          resolve();
        };

        // 接收消息
        ws.onmessage = async (event) => {
          try {
            let data = typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data);

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
                  console.error("消息解密失败:", error);
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
            console.error("WebSocket 消息解析错误:", error);
            this.emit({
              type: EnginePacketType.CLOSE,
              data: "解析错误",
            });
          }
        };

        // 连接关闭
        ws.onclose = () => {
          this.state = TransportState.DISCONNECTED;
          this.emit({
            type: EnginePacketType.CLOSE,
          });
        };

        // 连接错误
        ws.onerror = (error) => {
          this.state = TransportState.DISCONNECTED;
          reject(error);
        };
      } catch (error) {
        this.state = TransportState.DISCONNECTED;
        reject(error);
      }
    });
  }

  /**
   * 发送数据包
   * @param packet 数据包
   */
  async send(packet: EnginePacket): Promise<void> {
    if (this.state !== TransportState.CONNECTED || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      let encoded = encodePacket(packet);

      // 如果启用加密，只加密 MESSAGE 类型的数据包（包含 Socket.IO 数据包）
      // OPEN、CLOSE、PING、PONG 等控制数据包不加密
      if (this.encryptionManager && packet.type === EnginePacketType.MESSAGE) {
        encoded = await this.encryptionManager.encryptMessage(encoded);
      }

      this.ws.send(encoded);
    } catch (error) {
      console.error("WebSocket 发送错误:", error);
      this.state = TransportState.DISCONNECTED;
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
    if (this.state === TransportState.CLOSED) {
      return;
    }

    this.state = TransportState.CLOSED;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 构建 WebSocket URL
   * @returns WebSocket URL
   */
  private buildWebSocketUrl(): string {
    const url = new URL(this.url);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${url.host}${url.pathname}websocket/${this.sid}`;

    // 添加查询参数
    const query = new URLSearchParams(url.search);
    if (this.sid) {
      query.set("sid", this.sid);
    }

    return query.toString() ? `${wsUrl}?${query.toString()}` : wsUrl;
  }
}
