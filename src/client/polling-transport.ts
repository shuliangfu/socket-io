/**
 * @fileoverview 客户端 HTTP 长轮询传输层实现
 * 使用 HTTP 长轮询作为传输方式
 */

import type { EncryptionManager } from "../encryption/encryption-manager.ts";
import { decodePayload, encodePayload } from "../engine/parser.ts";
import { EnginePacket, EnginePacketType } from "../types.ts";
import { ClientTransport, TransportState } from "./transport.ts";

/**
 * 客户端 HTTP 长轮询传输层
 */
export class ClientPollingTransport extends ClientTransport {
  /** 服务器 URL */
  private url: string = "";
  /** Socket ID */
  private sid: string = "";
  /** 是否正在轮询 */
  private polling: boolean = false;
  /** 是否正在执行轮询请求 */
  private pollingInProgress: boolean = false;
  /** 待发送的数据包队列 */
  private sendQueue: EnginePacket[] = [];
  /** 轮询定时器 */
  private pollTimer: number | null = null;
  /** AbortController 用于取消 fetch 请求 */
  private abortController: AbortController | null = null;
  /** 加密管理器（可选） */
  private encryptionManager?: EncryptionManager;

  /**
   * 创建客户端 HTTP 长轮询传输层
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

    if (this.state === TransportState.CONNECTED) {
      return;
    }

    this.state = TransportState.CONNECTING;

    try {
      // 发送握手请求
      const handshakeUrl = this.buildUrl("", { transport: "polling" });
      const response = await fetch(handshakeUrl, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`握手失败: ${response.status}`);
      }

      const handshake = await response.json();
      this.sid = handshake.sid;

      // 开始轮询
      this.state = TransportState.CONNECTED;
      this.startPolling();
    } catch (error) {
      this.state = TransportState.DISCONNECTED;
      throw error;
    }
  }

  /**
   * 开始轮询
   */
  private startPolling(): void {
    if (this.polling) {
      return;
    }

    this.polling = true;
    this.poll();
  }

  /**
   * 执行轮询
   */
  private async poll(): Promise<void> {
    // 检查是否应该继续轮询
    if (!this.polling || this.state !== TransportState.CONNECTED) {
      this.pollingInProgress = false;
      return;
    }

    // 如果已经有轮询在进行，不启动新的
    if (this.pollingInProgress) {
      return;
    }
    this.pollingInProgress = true;

    // 创建新的 AbortController
    this.abortController = new AbortController();

    try {
      // 发送 GET 请求等待数据（设置超时，避免无限等待）
      const pollUrl = this.buildUrl(`polling/${this.sid}`);

      // 创建带超时的 AbortController（最多等待 30 秒）
      const timeoutId = setTimeout(() => {
        if (this.abortController && !this.abortController.signal.aborted) {
          this.abortController.abort();
        }
      }, 30000);

      try {
        const response = await fetch(pollUrl, {
          method: "GET",
          signal: this.abortController.signal,
        });

        clearTimeout(timeoutId);

        // 检查状态，如果已经停止轮询，不再处理响应
        if (!this.polling || this.state !== TransportState.CONNECTED) {
          this.pollingInProgress = false;
          this.abortController = null;
          return;
        }

        if (!response.ok) {
          throw new Error(`轮询失败: ${response.status}`);
        }

        let text = await response.text();
        if (text) {
          // 如果启用加密，尝试解密
          if (this.encryptionManager) {
            try {
              // 检查是否是加密消息
              if (this.encryptionManager.isEncrypted(text)) {
                text = await this.encryptionManager.decryptMessage(text);
              }
            } catch {
              // 解密失败，可能是未加密的消息或密钥不匹配
              // 如果是加密消息但解密失败，记录错误
              if (this.encryptionManager.isEncrypted(text)) {
                this.polling = false;
                this.pollingInProgress = false;
                this.state = TransportState.DISCONNECTED;
                this.abortController = null;
                this.emit({
                  type: EnginePacketType.CLOSE,
                  data: "解密错误",
                });
                return;
              }
              // 不是加密消息，继续使用原始数据
            }
          }

          const packets = decodePayload(text);
          for (const packet of packets) {
            // 如果收到关闭数据包，立即停止轮询
            if (packet.type === EnginePacketType.CLOSE) {
              this.polling = false;
              this.pollingInProgress = false;
              this.state = TransportState.CLOSED;
              this.abortController = null;
              return; // 收到关闭数据包，不再继续轮询
            }
            this.emit(packet);
          }
        }

        // 标记轮询完成
        this.pollingInProgress = false;
        this.abortController = null;

        // 继续轮询（使用 setTimeout 添加小延迟，避免过于频繁）
        if (this.polling && this.state === TransportState.CONNECTED) {
          // 清除之前的定时器
          if (this.pollTimer !== null) {
            clearTimeout(this.pollTimer);
          }
          this.pollTimer = setTimeout(() => {
            this.pollTimer = null;
            if (this.polling && this.state === TransportState.CONNECTED) {
              this.poll();
            }
          }, 50); // 50ms 延迟，避免过于频繁的请求
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      this.pollingInProgress = false;
      this.abortController = null;

      // 如果是 AbortError，说明是主动取消的，不记录错误
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      // 只有在连接状态时才处理错误
      if (this.state === TransportState.CONNECTED) {
        console.error("轮询错误:", error);
        this.state = TransportState.DISCONNECTED;
        this.polling = false;
        this.emit({
          type: EnginePacketType.CLOSE,
          data: "轮询错误",
        });
      }
    }
  }

  /**
   * 发送数据包
   * @param packet 数据包
   */
  async send(packet: EnginePacket): Promise<void> {
    if (this.state !== TransportState.CONNECTED) {
      this.sendQueue.push(packet);
      return;
    }

    try {
      // 将数据包添加到队列
      this.sendQueue.push(packet);

      // 如果有待发送的数据包，立即发送
      if (this.sendQueue.length > 0) {
        const packets = [...this.sendQueue];
        this.sendQueue = [];

        // 检查是否所有数据包都是 MESSAGE 类型
        const allMessages = packets.every((p) =>
          p.type === EnginePacketType.MESSAGE
        );

        let payload = encodePayload(packets);

        // 只加密纯 MESSAGE 数据包的 payload（如果启用加密）
        // 如果包含控制数据包（OPEN、CLOSE、PING、PONG 等），则不加密
        if (this.encryptionManager && allMessages) {
          payload = await this.encryptionManager.encryptMessage(payload);
        }

        const postUrl = this.buildUrl(`polling/${this.sid}`);
        const response = await fetch(postUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
          body: payload,
        });

        if (!response.ok) {
          throw new Error(`发送失败: ${response.status}`);
        }
      }
    } catch (error) {
      console.error("发送数据包错误:", error);
      // 将数据包重新加入队列
      this.sendQueue.unshift(packet);
    }
  }

  /**
   * 关闭传输
   */
  close(): void {
    if (this.state === TransportState.CLOSED) {
      return;
    }

    // 先停止轮询，防止继续发送请求
    this.polling = false;

    // 取消正在进行的 fetch 请求（必须立即取消，不能等待）
    if (this.abortController) {
      try {
        // 立即取消，不等待
        this.abortController.abort();
      } catch {
        // 忽略取消错误
      }
      this.abortController = null;
    }

    // 清除轮询定时器
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // 立即标记为关闭状态，不再处理任何响应
    this.pollingInProgress = false;
    this.state = TransportState.CLOSED;
  }

  /**
   * 构建 URL
   * @param path 路径
   * @param query 查询参数
   * @returns 完整的 URL
   */
  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(this.url);
    url.pathname = url.pathname.replace(/\/$/, "") + "/" + path;

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    if (this.sid) {
      url.searchParams.set("sid", this.sid);
    }

    return url.toString();
  }
}
