/**
 * @fileoverview HTTP 长轮询传输层实现
 * 使用 HTTP 长轮询作为传输方式
 */

import type { Logger } from "@dreamer/logger";
import type { EncryptionManager } from "../encryption/encryption-manager.ts";
import { EnginePacket, EnginePacketType } from "../types.ts";
import { decodePayload, encodePayload } from "./parser.ts";
import { Transport } from "./transport.ts";

/**
 * 轮询请求回调
 */
type PollingResolve = (response: Response) => void;

/**
 * HTTP 长轮询传输层
 */
export class PollingTransport extends Transport {
  /** 待发送的数据包队列 */
  private pendingPackets: EnginePacket[] = [];
  /** 当前等待的轮询请求回调 */
  private currentPollResolve: PollingResolve | null = null;
  /** 轮询超时定时器 */
  private pollTimeout: number | null = null;
  /** 轮询超时时间（毫秒） */
  private readonly timeout: number;
  /** 加密管理器（可选） */
  private encryptionManager?: EncryptionManager;

  /**
   * 创建 HTTP 长轮询传输层
   * @param timeout 轮询超时时间（毫秒，默认：60000）
   * @param encryptionManager 加密管理器（可选）
   * @param logger Logger 实例（可选），用于统一日志输出
   */
  constructor(
    timeout: number = 60000,
    encryptionManager?: EncryptionManager,
    logger?: Logger,
  ) {
    super(logger);
    this.timeout = timeout;
    this.encryptionManager = encryptionManager;
  }

  /**
   * 处理轮询请求
   * @param request HTTP 请求
   * @returns HTTP 响应
   */
  async handlePoll(request: Request): Promise<Response> {
    // 如果是 GET 请求，表示客户端在等待数据
    if (request.method === "GET") {
      return await this.handlePollGet();
    }

    // 如果是 POST 请求，表示客户端在发送数据
    if (request.method === "POST") {
      return await this.handlePollPost(request);
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  /**
   * 处理 GET 轮询请求（客户端等待数据）
   * @returns HTTP 响应
   */
  private async handlePollGet(): Promise<Response> {
    // 如果有待发送的数据包，立即返回
    if (this.pendingPackets.length > 0) {
      const packets = [...this.pendingPackets];
      this.pendingPackets = [];

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

      return this.createResponse(payload);
    }

    // 如果没有数据，等待数据或超时
    return new Promise<Response>((resolve) => {
      this.currentPollResolve = resolve;

      // 设置超时
      this.pollTimeout = setTimeout(() => {
        if (this.currentPollResolve === resolve) {
          this.currentPollResolve = null;
          // 超时返回空响应
          resolve(this.createResponse(""));
        }
      }, this.timeout);
    });
  }

  /**
   * 处理 POST 轮询请求（客户端发送数据）
   * @param request HTTP 请求
   * @returns HTTP 响应
   */
  private async handlePollPost(request: Request): Promise<Response> {
    try {
      let text = await request.text();

      // 如果启用加密，尝试解密
      if (this.encryptionManager) {
        try {
          // 检查是否是加密消息
          if (this.encryptionManager.isEncrypted(text)) {
            text = await this.encryptionManager.decryptMessage(text);
          }
        } catch {
          // 解密失败，可能是未加密的消息或密钥不匹配
          // 如果是加密消息但解密失败，返回错误
          if (this.encryptionManager.isEncrypted(text)) {
            return new Response("Decryption Error", { status: 400 });
          }
          // 不是加密消息，继续使用原始数据
        }
      }

      const packets = decodePayload(text);
      for (const packet of packets) {
        this.emit(packet);
      }

      return this.createResponse("ok");
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
  }

  /**
   * 创建 HTTP 响应
   * @param body 响应体
   * @returns HTTP 响应
   */
  private createResponse(body: string): Response {
    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  /**
   * 刷新轮询响应（发送待发送的数据包）
   */
  private async flushPoll(): Promise<void> {
    if (!this.currentPollResolve) {
      return;
    }

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    const packets = [...this.pendingPackets];
    this.pendingPackets = [];

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

    const resolve = this.currentPollResolve;
    this.currentPollResolve = null;
    resolve(this.createResponse(payload));
  }

  /**
   * 发送数据包
   * @param packet 数据包
   */
  send(packet: EnginePacket): void {
    if (this.closed) {
      return;
    }

    this.pendingPackets.push(packet);

    // 如果有等待的轮询请求，立即刷新
    if (this.currentPollResolve) {
      this.flushPoll().catch(() => {
        // 忽略刷新错误
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

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // 如果有等待的轮询请求，立即响应关闭数据包
    if (this.currentPollResolve) {
      // 发送关闭数据包
      const closePacket = encodePayload([{
        type: EnginePacketType.CLOSE,
        data: "",
      }]);
      const resolve = this.currentPollResolve;
      this.currentPollResolve = null;
      resolve(this.createResponse(closePacket));
    }

    // 清空待发送的数据包
    this.pendingPackets = [];

    // 释放监听器引用，防止内存泄漏
    this.clearListeners();
  }

  /**
   * 检查是否有等待的轮询请求
   */
  hasPendingPoll(): boolean {
    return this.currentPollResolve !== null;
  }

  /**
   * 检查是否有待发送的数据包
   * 供 Server 判断是否应跳过批量处理、立即响应
   */
  hasPendingPackets(): boolean {
    return this.pendingPackets.length > 0;
  }
}
