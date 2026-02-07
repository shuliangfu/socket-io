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

import { EncryptionManager } from "../encryption/encryption-manager.ts";
import { ClientEventListener, ClientOptions, TransportType } from "../types.ts";
import { ClientMessageQueue } from "./message-queue.ts";
import { ClientPollingTransport } from "./polling-transport.ts";
import { SmartReconnection } from "./smart-reconnection.ts";
import { ClientSocket } from "./socket.ts";
import { ClientTransport } from "./transport.ts";
import { ClientWebSocketTransport } from "./websocket-transport.ts";

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
  /** 已注册转发监听器的事件集合 */
  private forwardedEvents: Set<string> = new Set();
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
  /** 是否由用户主动断开（disconnect 调用），若为 true 则 disconnect 事件不触发自动重连 */
  private intentionalDisconnect = false;

  /**
   * 创建 Socket.IO 客户端实例
   *
   * @param options - 客户端配置选项
   * @param options.url - 服务器 URL（必需）
   * @param options.namespace - 命名空间，默认为 "/"
   * @param options.autoConnect - 是否自动连接，默认为 true
   * @param options.autoReconnect - 是否自动重连，默认为 true
   * @param options.reconnectionDelay - 重连延迟（毫秒），默认为 1000
   * @param options.reconnectionDelayMax - 最大重连延迟（毫秒），默认为 5000
   * @param options.reconnectionAttempts - 重连尝试次数，默认为 Infinity
   * @param options.transports - 允许的传输方式数组，默认为 ["websocket", "polling"]
   * @param options.timeout - 连接超时时间（毫秒），默认为 20000
   * @param options.query - 查询参数对象（可选）
   * @param options.encryption - 加密配置（可选）
   *
   * @example
   * ```typescript
   * const client = new Client({
   *   url: "http://localhost:3000",
   *   namespace: "/chat",
   *   autoConnect: true,
   *   autoReconnect: true,
   * });
   * ```
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
   *
   * 建立与 Socket.IO 服务器的连接。如果已经连接，则直接返回。
   * 连接过程包括：
   * 1. 选择传输方式（WebSocket 或 HTTP 长轮询）
   * 2. 创建传输层并连接到服务器
   * 3. 创建 Socket 实例
   * 4. 设置事件监听器
   * 5. 为已注册的自定义事件设置转发
   *
   * @returns Promise<void> 连接成功时解析，连接失败时拒绝
   * @throws {Error} 当传输方式不支持时抛出错误
   *
   * @example
   * ```typescript
   * await client.connect();
   * console.log("连接成功");
   * ```
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    this.intentionalDisconnect = false;

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

      // WebSocket 连接建立后服务端会立即发送 OPEN 包，此时 ClientSocket 可能尚未创建。
      // 传输层会缓冲该包，待 ClientSocket 注册监听器时再投递（见 ClientTransport.packetBuffer）
      await this.transport.connect(url);

      this.socket = new ClientSocket(this.transport, this.options.namespace);

      // 监听 Socket 事件
      this.socket.on("connect", () => {
        this.smartReconnection.onSuccess();
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        this.triggerEvent("connect");

        // 连接成功后，发送队列中的消息
        this.messageQueue.flush((event: string, data: any) => {
          if (this.socket?.connected) {
            this.socket.emit(event, data);
          }
        });
      });

      this.socket.on("disconnect", (reason) => {
        this.triggerEvent("disconnect", reason);
        // 用户主动 disconnect 时不应触发自动重连
        if (this.intentionalDisconnect) return;
        // 如果启用自动重连，尝试重连
        if (this.options.autoReconnect && !this.reconnecting) {
          this.scheduleReconnect();
        }
      });

      this.socket.on("connect_error", (error) => {
        this.smartReconnection.onError();
        // 本次连接尝试结束，重置 reconnecting 以便能再次调度重连
        this.reconnecting = false;
        this.triggerEvent("connect_error", error);
        // 如果启用自动重连，尝试重连
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      // 转发其他事件
      this.socket.on("message", (data) => {
        this.triggerEvent("message", data);
      });

      // 为所有已注册的自定义事件设置转发
      this.setupCustomEventForwarding();
    } catch (error) {
      this.smartReconnection.onError();
      // 本次连接尝试结束，重置 reconnecting 以便能再次调度重连
      this.reconnecting = false;
      // 只在启用自动重连时输出错误日志，避免测试清理时的噪音
      if (this.options.autoReconnect) {
        console.error("连接失败:", error);
      }
      this.triggerEvent("connect_error", error);

      // 如果启用自动重连，尝试重连
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * 断开与服务器的连接
   *
   * 断开连接时会：
   * 1. 清除重连定时器
   * 2. 重置重连状态
   * 3. 断开 Socket 连接
   * 4. 关闭传输层
   *
   * 断开后不会自动重连，除非手动调用 `connect()` 方法。
   *
   * @example
   * ```typescript
   * client.disconnect();
   * console.log("已断开连接");
   * ```
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
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
   * 向服务器发送事件
   *
   * 如果客户端已连接，事件会立即发送。如果未连接，事件会被加入消息队列，
   * 在连接成功后自动发送。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param data - 事件数据，可以是任意类型（对象、数组、字符串、数字等）
   * @param callback - 确认回调函数（可选），服务器可以通过回调返回响应数据
   *
   * @example
   * ```typescript
   * // 发送简单事件
   * client.emit("chat-message", { text: "Hello" });
   *
   * // 发送带确认的事件
   * client.emit("get-user-info", { userId: 123 }, (response) => {
   *   console.log("服务器响应:", response);
   * });
   * ```
   */
  emit(
    event: string,
    data?: unknown,
    callback?: (response: unknown) => void,
  ): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data, callback);
    } else {
      // 如果未连接，将消息加入队列
      this.messageQueue.enqueue(event, data);
    }
  }

  /**
   * 监听服务器发送的事件
   *
   * 注册一个事件监听器，当服务器发送对应事件时，监听器会被调用。
   * 可以为一个事件注册多个监听器，它们会按注册顺序依次调用。
   *
   * 对于自定义事件（非系统事件），会自动在 ClientSocket 上注册转发监听器，
   * 确保事件能够正确传递。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param listener - 监听器函数，接收事件数据作为参数
   *
   * @example
   * ```typescript
   * // 监听系统事件
   * client.on("connect", () => {
   *   console.log("已连接");
   * });
   *
   * // 监听自定义事件
   * client.on("chat-message", (data) => {
   *   console.log("收到消息:", data);
   * });
   * ```
   */
  on(event: string, listener: ClientEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    // 对于自定义事件（非系统事件），同时在 ClientSocket 上注册监听器
    // 系统事件（connect, disconnect, connect_error, message）已经在 connect() 中处理
    const systemEvents = ["connect", "disconnect", "connect_error", "message"];
    if (
      !systemEvents.includes(event) && this.socket &&
      !this.forwardedEvents.has(event)
    ) {
      this.forwardedEvents.add(event);
      this.socket.on(event, (data: any) => {
        this.triggerEvent(event, data);
      });
    }
  }

  /**
   * 移除事件监听器
   *
   * 如果提供了 `listener` 参数，则只移除该特定的监听器。
   * 如果不提供 `listener` 参数，则移除该事件的所有监听器。
   *
   * @param event - 事件名称
   * @param listener - 要移除的监听器函数（可选），不提供则移除该事件的所有监听器
   *
   * @example
   * ```typescript
   * const handler = (data) => console.log(data);
   * client.on("message", handler);
   *
   * // 移除特定监听器
   * client.off("message", handler);
   *
   * // 移除所有监听器
   * client.off("message");
   * ```
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
        // 如果所有监听器都被移除，也从转发集合中移除
        this.forwardedEvents.delete(event);
      }
    } else {
      this.listeners.delete(event);
      // 移除所有监听器时，也从转发集合中移除
      this.forwardedEvents.delete(event);
    }
  }

  /**
   * 监听一次事件（标准 Socket.IO API）
   *
   * 注册一个只执行一次的事件监听器。当事件第一次触发时，监听器会被调用，
   * 然后自动移除，不会再次触发。
   *
   * @param event - 事件名称
   * @param listener - 监听器函数，接收事件数据作为参数
   *
   * @example
   * ```typescript
   * // 只监听一次连接事件
   * client.once("connect", () => {
   *   console.log("首次连接成功");
   * });
   *
   * // 只接收一次服务器消息
   * client.once("welcome-message", (data) => {
   *   console.log("欢迎消息:", data);
   * });
   * ```
   */
  once(event: string, listener: ClientEventListener): void {
    const onceWrapper: ClientEventListener = (...args: any[]) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    this.on(event, onceWrapper);
  }

  /**
   * 移除所有事件监听器（标准 Socket.IO API）
   *
   * 如果提供了 `event` 参数，则只移除该事件的所有监听器。
   * 如果不提供 `event` 参数，则移除所有事件的所有监听器。
   *
   * @param event - 事件名称（可选），不提供则移除所有事件的所有监听器
   *
   * @example
   * ```typescript
   * // 移除特定事件的所有监听器
   * client.removeAllListeners("message");
   *
   * // 移除所有事件的所有监听器
   * client.removeAllListeners();
   * ```
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      this.forwardedEvents.delete(event);
    } else {
      this.listeners.clear();
      this.forwardedEvents.clear();
    }
  }

  /**
   * 触发事件（内部使用）
   *
   * 调用指定事件的所有监听器，并传递事件数据。
   * 如果监听器执行时抛出错误，会被捕获并记录到控制台，不会影响其他监听器的执行。
   *
   * @param event - 事件名称
   * @param data - 事件数据，会传递给所有监听器
   *
   * @internal
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
   * 为所有已注册的自定义事件设置转发
   *
   * 在连接建立后，为所有已注册的自定义事件（非系统事件）在 ClientSocket 上
   * 注册转发监听器，确保这些事件能够从 ClientSocket 正确转发到 Client。
   *
   * 系统事件（connect, disconnect, connect_error, message）已经在 connect() 方法中处理。
   *
   * @internal
   */
  private setupCustomEventForwarding(): void {
    if (!this.socket) {
      return;
    }

    const systemEvents = ["connect", "disconnect", "connect_error", "message"];
    for (const event of this.listeners.keys()) {
      if (!systemEvents.includes(event) && !this.forwardedEvents.has(event)) {
        this.forwardedEvents.add(event);
        this.socket.on(event, (data: any) => {
          this.triggerEvent(event, data);
        });
      }
    }
  }

  /**
   * 安排重连
   *
   * 根据智能重连策略计算延迟时间，然后安排重连。
   * 重连时会尝试下一个传输方式（如果当前传输方式失败）。
   *
   * 如果重连次数超过配置的最大次数，会触发 "reconnect_failed" 事件并停止重连。
   *
   * @internal
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
      // 触发 reconnecting 事件，便于 UI 显示「重连中…」
      this.triggerEvent("reconnecting", this.reconnectAttempts);
      // 尝试下一个传输方式
      this.transportIndex = (this.transportIndex + 1) %
        this.options.transports.length;
      this.connect();
    }, delay) as unknown as number;
  }

  /**
   * 构建连接 URL
   *
   * 根据配置的服务器 URL 和命名空间构建完整的连接 URL。
   * 会自动添加 Socket.IO 路径前缀和查询参数。
   *
   * @returns 完整的连接 URL 字符串
   *
   * @internal
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
   *
   * 返回当前连接的 Socket ID。如果未连接，返回空字符串。
   * Socket ID 是服务器为每个连接分配的唯一标识符。
   *
   * @returns Socket ID 字符串，未连接时返回空字符串
   *
   * @example
   * ```typescript
   * const socketId = client.getId();
   * console.log("我的 Socket ID:", socketId);
   * ```
   */
  getId(): string {
    return this.socket?.id || "";
  }

  /**
   * 检查是否已连接到服务器
   *
   * @returns 如果已连接返回 true，否则返回 false
   *
   * @example
   * ```typescript
   * if (client.isConnected()) {
   *   client.emit("message", "Hello");
   * } else {
   *   console.log("未连接，无法发送消息");
   * }
   * ```
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// 导出传输层类（用于测试）
export { ClientPollingTransport } from "./polling-transport.ts";
export { ClientTransport } from "./transport.ts";
export { ClientWebSocketTransport } from "./websocket-transport.ts";

// 导出类型
export type { ClientEventListener, ClientOptions } from "../types.ts";
export { TransportState } from "./transport.ts";
