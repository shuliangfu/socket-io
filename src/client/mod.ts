/**
 * @module @dreamer/socket.io/client
 *
 * Socket.IO 客户端库，用于浏览器环境，提供实时双向通信功能。
 *
 * 功能特性：
 * - Socket.IO 客户端：支持 WebSocket 和 HTTP 长轮询传输
 * - 自动降级：从 WebSocket 自动降级到 HTTP 长轮询
 * - 自动重连：支持自动重连机制
 * - 事件系统：连接事件、消息事件、自定义事件支持
 * - 命名空间：支持命名空间隔离不同业务场景
 *
 * @example
 * ```typescript
 * import { Client } from "jsr:@dreamer/socket.io/client";
 *
 * const client = new Client({
 *   url: "http://localhost:3000",
 *   namespace: "/",
 * });
 *
 * client.on("connect", () => {
 *   console.log("已连接");
 *   client.emit("chat-message", { text: "Hello" });
 * });
 *
 * client.on("chat-response", (data) => {
 *   console.log("收到响应:", data);
 * });
 * ```
 */

import { ClientEventListener, ClientOptions, TransportType } from "../types.ts";
import { ClientPollingTransport } from "./polling-transport.ts";
import { ClientSocket } from "./socket.ts";
import { ClientTransport } from "./transport.ts";
import { ClientWebSocketTransport } from "./websocket-transport.ts";
import { ClientMessageQueue } from "./message-queue.ts";
import { SmartReconnection } from "./smart-reconnection.ts";
import { EncryptionManager } from "../encryption/encryption-manager.ts";

/**
 * Socket.IO 客户端
 */
export class Client {
  /** 客户端配置 */
  public readonly options:
    & Required<
      Pick<
        ClientOptions,
        | "namespace"
        | "autoConnect"
        | "autoReconnect"
        | "reconnectionDelay"
        | "reconnectionDelayMax"
        | "reconnectionAttempts"
        | "transports"
        | "timeout"
      >
    >
    & ClientOptions;
  /** Socket 连接 */
  private socket: ClientSocket | null = null;
  /** 传输层 */
  private transport: ClientTransport | null = null;
  /** 事件监听器 */
  private listeners: Map<string, ClientEventListener[]> = new Map();
  /** 重连定时器 */
  private reconnectTimer: number | null = null;
  /** 重连尝试次数 */
  private reconnectAttempts = 0;
  /** 是否正在重连 */
  private reconnecting = false;
  /** 当前传输方式索引 */
  private transportIndex = 0;
  /** 智能重连管理器 */
  private smartReconnection: SmartReconnection;
  /** 客户端消息队列 */
  private messageQueue: ClientMessageQueue;
  /** 加密管理器（可选） */
  private encryptionManager?: EncryptionManager;

  /**
   * 创建 Socket.IO 客户端实例
   * @param options 客户端配置选项
   */
  constructor(options: ClientOptions) {
    this.options = {
      namespace: options.namespace || "/",
      autoConnect: options.autoConnect !== false,
      autoReconnect: options.autoReconnect !== false,
      reconnectionDelay: options.reconnectionDelay || 1000,
      reconnectionDelayMax: options.reconnectionDelayMax || 5000,
      reconnectionAttempts: options.reconnectionAttempts ?? Infinity,
      transports: options.transports || ["websocket", "polling"],
      timeout: options.timeout || 20000,
      ...options,
    } as
      & Required<
        Pick<
          ClientOptions,
          | "namespace"
          | "autoConnect"
          | "autoReconnect"
          | "reconnectionDelay"
          | "reconnectionDelayMax"
          | "reconnectionAttempts"
          | "transports"
          | "timeout"
        >
      >
      & ClientOptions;

    // 创建智能重连管理器
    this.smartReconnection = new SmartReconnection(
      this.options.reconnectionDelay,
      this.options.reconnectionDelayMax,
    );

    // 创建客户端消息队列
    this.messageQueue = new ClientMessageQueue(1000, 60000);

    // 创建加密管理器（如果启用加密）
    if (this.options.encryption) {
      this.encryptionManager = new EncryptionManager(this.options.encryption);
    }

    // 如果启用自动连接，立即连接
    if (this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * 连接到服务器
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    try {
      // 选择传输方式
      const transportType = this.options
        .transports[this.transportIndex] as TransportType;

      // 创建传输层
      if (transportType === "websocket") {
        this.transport = new ClientWebSocketTransport(this.encryptionManager);
      } else if (transportType === "polling") {
        this.transport = new ClientPollingTransport(this.encryptionManager);
      } else {
        throw new Error(`不支持的传输方式: ${transportType}`);
      }

      // 构建连接 URL
      const url = this.buildUrl();

      // 连接到服务器
      await this.transport.connect(url);

      // 创建 Socket
      this.socket = new ClientSocket(this.transport, this.options.namespace);

      // 监听 Socket 事件
      this.socket.on("connect", async () => {
        this.smartReconnection.onSuccess();
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        this.triggerEvent("connect");

        // 连接成功后，发送队列中的消息
        await this.messageQueue.flush((event: string, data: any) => {
          if (this.socket?.connected) {
            this.socket.emit(event, data);
          }
        });
      });

      this.socket.on("disconnect", (reason) => {
        this.triggerEvent("disconnect", reason);
        // 如果启用自动重连，尝试重连
        if (this.options.autoReconnect && !this.reconnecting) {
          this.scheduleReconnect();
        }
      });

      this.socket.on("connect_error", (error) => {
        this.smartReconnection.onError();
        this.triggerEvent("connect_error", error);
        // 如果启用自动重连，尝试重连
        if (this.options.autoReconnect && !this.reconnecting) {
          this.scheduleReconnect();
        }
      });

      // 转发其他事件
      this.socket.on("message", (data) => {
        this.triggerEvent("message", data);
      });
    } catch (error) {
      this.smartReconnection.onError();
      // 只在启用自动重连时输出错误日志，避免测试清理时的噪音
      if (this.options.autoReconnect) {
        console.error("连接失败:", error);
      }
      this.triggerEvent("connect_error", error);

      // 如果启用自动重连，尝试重连
      if (this.options.autoReconnect && !this.reconnecting) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnecting = false;
    this.reconnectAttempts = 0;

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
  }

  /**
   * 发送事件
   * @param event 事件名称
   * @param data 事件数据
   * @param callback 确认回调（可选）
   */
  emit(event: string, data?: any, callback?: (response: any) => void): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data, callback);
    } else {
      // 如果未连接，将消息加入队列
      this.messageQueue.enqueue(event, data);
    }
  }

  /**
   * 监听事件
   * @param event 事件名称
   * @param listener 监听器函数
   */
  on(event: string, listener: ClientEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  /**
   * 移除事件监听器
   * @param event 事件名称
   * @param listener 监听器函数（可选，不提供则移除所有监听器）
   */
  off(event: string, listener?: ClientEventListener): void {
    if (!this.listeners.has(event)) {
      return;
    }

    if (listener) {
      const listeners = this.listeners.get(event)!;
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this.listeners.delete(event);
      }
    } else {
      this.listeners.delete(event);
    }
  }

  /**
   * 触发事件（内部使用）
   * @param event 事件名称
   * @param data 事件数据
   */
  private triggerEvent(event: string, data?: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`事件监听器错误 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnecting) {
      return;
    }

    // 检查重连次数
    if (this.reconnectAttempts >= this.options.reconnectionAttempts) {
      this.triggerEvent("reconnect_failed");
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    // 检查是否应该重连
    if (!this.smartReconnection.shouldReconnect()) {
      this.reconnecting = false;
      return;
    }

    // 使用智能重连策略计算延迟
    const delay = this.smartReconnection.calculateDelay();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // 尝试下一个传输方式
      this.transportIndex = (this.transportIndex + 1) %
        this.options.transports.length;
      this.connect();
    }, delay) as unknown as number;
  }

  /**
   * 构建连接 URL
   * @returns 连接 URL
   */
  private buildUrl(): string {
    const url = new URL(this.options.url);
    url.pathname = url.pathname.replace(/\/$/, "") + "/socket.io/";

    // 添加查询参数
    if (this.options.query) {
      for (const [key, value] of Object.entries(this.options.query)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  /**
   * 获取 Socket ID
   */
  getId(): string {
    return this.socket?.id || "";
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// 导出传输层类（用于测试）
export { ClientPollingTransport } from "./polling-transport.ts";
export { ClientWebSocketTransport } from "./websocket-transport.ts";
export { ClientTransport } from "./transport.ts";

// 导出类型
export type { ClientEventListener, ClientOptions } from "../types.ts";
export { TransportState } from "./transport.ts";
