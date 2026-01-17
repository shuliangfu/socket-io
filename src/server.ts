/**
 * @fileoverview Socket.IO 服务器
 * 管理 Socket.IO 服务器、连接、命名空间和事件
 */

import { serve, type ServeHandle, upgradeWebSocket } from "@dreamer/runtime-adapter";
import { EnginePacketType, Handshake, ServerEventListener, ServerOptions, TransportType } from "./types.ts";
import { EngineSocket } from "./engine/socket.ts";
import { PollingTransport } from "./engine/polling-transport.ts";
import { WebSocketTransport } from "./engine/websocket-transport.ts";
import { Namespace } from "./socketio/namespace.ts";
import { SocketIOSocket } from "./socketio/socket.ts";
import { BatchHeartbeatManager } from "./engine/heartbeat-manager.ts";
import { AdaptivePollingTimeout } from "./engine/adaptive-polling-timeout.ts";
import { PollingBatchHandler } from "./engine/polling-batch-handler.ts";
import { CompressionManager } from "./compression/compression-manager.ts";
import { StreamPacketProcessor } from "./streaming/stream-parser.ts";
import { HardwareAccelerator } from "./hardware-accel/accelerator.ts";
import { EncryptionManager } from "./encryption/encryption-manager.ts";
import type { SocketIOAdapter, AdapterMessage } from "./adapters/types.ts";
import { MemoryAdapter } from "./adapters/memory.ts";

/**
 * Socket.IO 服务器
 */
export class Server {
  /** 服务器配置 */
  public readonly options: Required<
    Pick<ServerOptions, "path" | "pingTimeout" | "pingInterval" | "transports" | "allowPolling" | "pollingTimeout">
  > & ServerOptions;
  /** Engine.IO Socket 连接池 */
  private engineSockets: Map<string, EngineSocket> = new Map();
  /** 命名空间映射 */
  private namespaces: Map<string, Namespace> = new Map();
  /** 事件监听器 */
  private listeners: Map<string, ServerEventListener[]> = new Map();
  /** HTTP 服务器句柄 */
  private httpServer?: ServeHandle;
  /** 轮询传输映射（Socket ID -> PollingTransport） */
  private pollingTransports: Map<string, PollingTransport> = new Map();
  /** 批量心跳管理器 */
  private heartbeatManager: BatchHeartbeatManager;
  /** 动态轮询超时管理器 */
  private adaptivePollingTimeout: AdaptivePollingTimeout;
  /** 轮询批量处理器 */
  private pollingBatchHandler?: PollingBatchHandler;
  /** 压缩管理器 */
  private compressionManager?: CompressionManager;
  /** 流式处理器（可选，用于大数据包） */
  private streamProcessor?: StreamPacketProcessor;
  /** 硬件加速器（可选，用于加速计算密集型操作） */
  private accelerator?: HardwareAccelerator;
  /** 加密管理器（可选，用于消息加密） */
  private encryptionManager?: EncryptionManager;
  /** 分布式适配器 */
  private adapter: SocketIOAdapter;
  /** 服务器 ID */
  private serverId: string;

  /**
   * 创建 Socket.IO 服务器实例
   * @param options 服务器配置选项
   */
  constructor(options: ServerOptions = {}) {
    this.options = {
      path: options.path || "/socket.io/",
      pingTimeout: options.pingTimeout || 20000,
      pingInterval: options.pingInterval || 25000,
      transports: options.transports || ["websocket", "polling"],
      allowPolling: options.allowPolling !== false,
      pollingTimeout: options.pollingTimeout || 60000,
      ...options,
    } as Required<
      Pick<ServerOptions, "path" | "pingTimeout" | "pingInterval" | "transports" | "allowPolling" | "pollingTimeout">
    > & ServerOptions;

    // 创建或使用提供的适配器
    this.adapter = this.options.adapter || new MemoryAdapter();

    // 生成服务器 ID
    this.serverId = `server-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // 创建默认命名空间
    const defaultNamespace = new Namespace("/", this.adapter, this.accelerator);
    this.namespaces.set("/", defaultNamespace);

    // 创建批量心跳管理器
    this.heartbeatManager = new BatchHeartbeatManager(
      this.options.pingInterval,
      this.options.pingTimeout,
    );

    // 创建动态轮询超时管理器
    this.adaptivePollingTimeout = new AdaptivePollingTimeout(
      this.options.pollingTimeout,
    );

    // 创建压缩管理器（如果启用压缩）
    if (this.options.compression) {
      this.compressionManager = new CompressionManager({
        algorithm: "gzip",
        minSize: 1024, // 只压缩大于 1KB 的消息
      });
    }

    // 创建流式处理器（如果启用流式处理）
    if (this.options.streaming) {
      const maxPacketSize = this.options.maxPacketSize || 10 * 1024 * 1024; // 默认 10MB
      // 流式处理器会在需要时创建（每个连接一个）
    }

    // 创建硬件加速器（如果启用硬件加速）
    if (this.options.hardwareAcceleration) {
      this.accelerator = new HardwareAccelerator({
        enableWasm: true,
        enableSIMD: true,
      });
    }

    // 创建加密管理器（如果启用加密）
    if (this.options.encryption) {
      this.encryptionManager = new EncryptionManager(this.options.encryption);
    }

    // 创建轮询批量处理器（用于批量处理轮询请求，提升性能）
    // 批量处理器会收集多个轮询请求，然后批量处理，减少系统调用
    this.pollingBatchHandler = new PollingBatchHandler(
      async (sids: string[]) => {
        const responses = new Map<string, Response>();
        // 批量处理多个轮询请求
        for (const sid of sids) {
          const transport = this.pollingTransports.get(sid);
          if (transport) {
            try {
              // 创建虚拟 GET 请求用于批量处理
              const request = new Request("http://localhost/polling", { method: "GET" });
              const response = await transport.handlePoll(request);
              responses.set(sid, response);
            } catch (error) {
              // 如果处理失败，返回错误响应
              console.error(`轮询批量处理失败 (sid: ${sid}):`, error);
              responses.set(sid, new Response("Internal Server Error", { status: 500 }));
            }
          } else {
            responses.set(sid, new Response("Not Found", { status: 404 }));
          }
        }
        return responses;
      },
      50, // 批量处理间隔：50ms（收集 50ms 内的请求后批量处理）
      100, // 最大等待时间：100ms（超过 100ms 的请求立即处理）
    );
  }

  /**
   * 启动服务器
   * @param host 主机地址（可选）
   * @param port 端口号（可选）
   */
  async listen(host?: string, port?: number): Promise<void> {
    const serverHost = host || this.options.host || "0.0.0.0";
    const serverPort = port || this.options.port || 3000;

    // 初始化适配器（收集所有命名空间的 Socket）
    const sockets = new Map<string, SocketIOSocket>();
    for (const namespace of this.namespaces.values()) {
      for (const [socketId, socket] of namespace.getSockets()) {
        sockets.set(socketId, socket);
      }
    }

    const initResult = this.adapter.init(this.serverId, sockets);
    if (initResult instanceof Promise) {
      await initResult;
    }

    // 订阅适配器消息
    const subscribeResult = this.adapter.subscribe(
      (message, fromServerId) => {
        this.handleAdapterMessage(message, fromServerId);
      },
    );
    if (subscribeResult instanceof Promise) {
      await subscribeResult;
    }

    // 使用 runtime-adapter 的 serve API，兼容 Deno 和 Bun
    this.httpServer = serve(
      {
        port: serverPort,
        host: serverHost === "0.0.0.0" ? undefined : serverHost,
      },
      async (request: Request) => {
        return this.handleRequest(request);
      },
    );

    console.log(`Socket.IO 服务器运行在 http://${serverHost}:${serverPort}${this.options.path}`);
  }

  /**
   * 处理 HTTP 请求
   * @param request HTTP 请求
   * @returns HTTP 响应
   */
  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 检查是否是 Socket.IO 路径
    if (!path.startsWith(this.options.path)) {
      return new Response("Not Found", { status: 404 });
    }

    // 处理 CORS
    if (this.options.allowCORS !== false) {
      const origin = request.headers.get("Origin");
      if (origin && this.isOriginAllowed(origin)) {
        const headers = new Headers({
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Credentials": "true",
        });
        if (request.method === "OPTIONS") {
          return new Response(null, { status: 200, headers });
        }
      }
    }

    // 解析路径：/socket.io/{transport}/{sid}?...
    const pathParts = path.slice(this.options.path.length).split("/");
    const transport = pathParts[0] as TransportType;
    const sid = pathParts[1];

    // 处理轮询传输
    if (transport === "polling") {
      return this.handlePolling(request, sid);
    }

    // 处理 WebSocket 传输
    if (transport === "websocket") {
      return this.handleWebSocket(request, sid);
    }

    // 处理 Engine.IO 握手
    if (path.endsWith("/") || path === this.options.path) {
      return this.handleHandshake(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  /**
   * 处理握手请求
   * @param request HTTP 请求
   * @returns HTTP 响应
   */
  private handleHandshake(request: Request): Response {
    // 生成 Socket ID
    const sid = this.generateSocketId();

    // 创建握手信息
    const handshake: Handshake = {
      query: Object.fromEntries(new URL(request.url).searchParams),
      headers: request.headers,
      url: request.url,
    };

    // 创建 Engine.IO Socket
    const engineSocket = new EngineSocket(
      sid,
      handshake,
      this.options.pingTimeout,
      this.options.pingInterval,
    );

    // 获取动态轮询超时时间
    const pollingTimeout = this.adaptivePollingTimeout.getTimeout();
    this.adaptivePollingTimeout.updateConnections(this.engineSockets.size + 1);

    // 创建轮询传输
    const pollingTransport = new PollingTransport(pollingTimeout, this.encryptionManager);
    engineSocket.setTransport(pollingTransport);
    this.pollingTransports.set(sid, pollingTransport);
    this.engineSockets.set(sid, engineSocket);

    // 添加到批量心跳管理器（禁用独立心跳）
    engineSocket.disableHeartbeat();
    this.heartbeatManager.add(engineSocket);

    // 监听 Engine.IO 消息
    engineSocket.on(async (packet) => {
      if (packet.type === EnginePacketType.MESSAGE && typeof packet.data === "string") {
        // 这是 Socket.IO 数据包，需要路由到命名空间
        await this.handleSocketIOMessage(engineSocket, packet.data);
      }
    });

    // 返回握手响应
    return new Response(JSON.stringify({
      sid,
      upgrades: ["websocket"],
      pingInterval: this.options.pingInterval,
      pingTimeout: this.options.pingTimeout,
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  /**
   * 处理轮询传输请求
   * @param request HTTP 请求
   * @param sid Socket ID
   * @returns HTTP 响应
   */
  private async handlePolling(request: Request, sid: string | undefined): Promise<Response> {
    if (!sid) {
      return new Response("Bad Request", { status: 400 });
    }

    const engineSocket = this.engineSockets.get(sid);
    if (!engineSocket) {
      return new Response("Not Found", { status: 404 });
    }

    const pollingTransport = this.pollingTransports.get(sid);
    if (!pollingTransport) {
      return new Response("Internal Server Error", { status: 500 });
    }

    // 如果是 GET 请求（轮询等待），检查是否有待发送的数据包
    // 如果有待发送的数据包，立即处理，不使用批量处理器（避免延迟）
    const hasPendingPackets = (pollingTransport as any).pendingPackets?.length > 0;

    // 如果是 GET 请求（轮询等待），且批量处理器可用，且没有待发送的数据包，使用批量处理
    if (request.method === "GET" && this.pollingBatchHandler && !pollingTransport.hasPendingPoll() && !hasPendingPackets) {
      return new Promise<Response>((resolve) => {
        this.pollingBatchHandler!.addPoll(sid, resolve);
      });
    }

    // 否则直接处理（POST 请求、已有待处理请求、或有待发送的数据包）
    return pollingTransport.handlePoll(request);
  }

  /**
   * 处理 WebSocket 传输请求
   * @param request HTTP 请求
   * @param sid Socket ID
   * @returns HTTP 响应
   */
  private handleWebSocket(request: Request, sid: string | undefined): Response {
    if (!sid) {
      return new Response("Bad Request", { status: 400 });
    }

    const engineSocket = this.engineSockets.get(sid);
    if (!engineSocket) {
      return new Response("Not Found", { status: 404 });
    }

    try {
      // 升级到 WebSocket
      const { socket, response } = upgradeWebSocket(request);

      // 创建 WebSocket 传输
      // 注意：upgradeWebSocket 返回的 socket 可能是 WebSocket 或适配器
      // 我们需要确保它是 WebSocket 类型
      const wsTransport = new WebSocketTransport(
        socket as WebSocket,
        this.compressionManager,
        this.encryptionManager,
      );
      engineSocket.setTransport(wsTransport);

      // 移除轮询传输
      const pollingTransport = this.pollingTransports.get(sid);
      if (pollingTransport) {
        pollingTransport.close();
        this.pollingTransports.delete(sid);
      }

      return response || new Response();
    } catch (error) {
      console.error("WebSocket 升级失败:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  /**
   * 处理 Socket.IO 消息
   * @param engineSocket Engine.IO Socket
   * @param data Socket.IO 数据包字符串
   */
  private async handleSocketIOMessage(engineSocket: EngineSocket, data: string): Promise<void> {
    // 解析 Socket.IO 数据包以获取命名空间
    let nsp = "/";
    try {
      const { decodePacket } = await import("./socketio/parser.ts");
      const packet = decodePacket(data);
      nsp = packet.nsp || "/";
    } catch (error) {
      // 解析失败，使用默认命名空间
      // 忽略解析错误
    }

    // 获取或创建命名空间
    let namespace = this.namespaces.get(nsp);
    if (!namespace) {
      namespace = new Namespace(nsp, this.adapter, this.accelerator);
      this.namespaces.set(nsp, namespace);
    }

    // 检查是否已经有 Socket.IO Socket
    let socket = namespace.getSocket(engineSocket.id);
    const isNewSocket = !socket;
    if (!socket) {
      // 创建新的 Socket.IO Socket
      socket = await namespace.addSocket(engineSocket);
    }

    // 如果是新创建的 Socket，需要手动处理当前数据包
    if (isNewSocket) {
      (socket as any).handleSocketIOPacket(data);
    }
  }

  /**
   * 监听连接事件
   * @param event 事件名称（必须是 "connection"）
   * @param listener 监听器函数
   */
  on(event: "connection", listener: ServerEventListener): void {
    if (event !== "connection") {
      throw new Error(`不支持的事件: ${event}`);
    }

    // 在默认命名空间上监听
    const defaultNamespace = this.namespaces.get("/");
    if (defaultNamespace) {
      defaultNamespace.on("connection", listener);
    }
  }

  /**
   * 获取命名空间
   * @param name 命名空间名称
   * @returns 命名空间
   */
  of(name: string): Namespace {
    if (!this.namespaces.has(name)) {
      const namespace = new Namespace(name, this.adapter, this.accelerator);
      this.namespaces.set(name, namespace);
    }
    return this.namespaces.get(name)!;
  }

  /**
   * 关闭服务器
   */
  async close(): Promise<void> {
    // 先清空批量处理器，确保所有待处理的轮询请求都能响应
    if (this.pollingBatchHandler) {
      this.pollingBatchHandler.clear();
    }

    // 然后关闭所有轮询传输，确保所有待处理的轮询请求都能响应
    for (const [sid, pollingTransport] of this.pollingTransports.entries()) {
      pollingTransport.close();
    }
    this.pollingTransports.clear();

    // 销毁心跳管理器
    this.heartbeatManager.destroy();

    // 更新连接数
    this.adaptivePollingTimeout.updateConnections(0);

    // 关闭所有 Engine.IO Socket
    for (const engineSocket of this.engineSockets.values()) {
      engineSocket.close();
    }
    this.engineSockets.clear();

    // 关闭适配器
    const closeResult = this.adapter.close();
    if (closeResult instanceof Promise) {
      await closeResult;
    }

    // 关闭 HTTP 服务器
    if (this.httpServer) {
      await this.httpServer.shutdown();
    }
  }

  /**
   * 处理来自适配器的消息（来自其他服务器）
   * @param message 消息数据
   * @param fromServerId 发送消息的服务器 ID
   */
  private async handleAdapterMessage(
    message: AdapterMessage,
    fromServerId: string,
  ): Promise<void> {
    // 如果是房间广播消息
    if (message.room && message.namespace) {
      const namespace = this.namespaces.get(message.namespace);
      if (namespace) {
        // 获取房间内的所有 Socket ID（包括本地和远程）
        const allSocketIdsResult = this.adapter.getSocketsInRoom(
          message.room,
          message.namespace,
        );
        const allSocketIds = allSocketIdsResult instanceof Promise
          ? await allSocketIdsResult
          : allSocketIdsResult;

        // 只处理本地 Socket
        for (const socketId of allSocketIds) {
          const socket = namespace.getSocket(socketId);
          if (socket && socket.connected && socketId !== message.excludeSocketId) {
            if (message.packet) {
              // 如果有数据包，直接发送
              const { encodePacket } = await import("./socketio/parser.ts");
              const encoded = encodePacket(message.packet);
              socket.sendRaw(encoded);
            } else if (message.event) {
              // 如果有事件，发送事件
              socket.emit(message.event, message.data);
            }
          }
        }
      }
    } else if (message.event) {
      // 全局广播消息
      for (const namespace of this.namespaces.values()) {
        for (const socket of namespace.getSockets().values()) {
          if (socket.connected && socket.id !== message.excludeSocketId) {
            socket.emit(message.event!, message.data);
          }
        }
      }
    }
  }

  /**
   * 生成 Socket ID
   * @returns Socket ID
   */
  private generateSocketId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 检查来源是否允许
   * @param origin 来源
   * @returns 是否允许
   */
  private isOriginAllowed(origin: string): boolean {
    if (!this.options.cors) {
      return true;
    }

    const corsOrigin = this.options.cors.origin;
    if (!corsOrigin) {
      return true;
    }

    if (typeof corsOrigin === "string") {
      return corsOrigin === "*" || corsOrigin === origin;
    }

    if (Array.isArray(corsOrigin)) {
      return corsOrigin.includes(origin);
    }

    if (typeof corsOrigin === "function") {
      return corsOrigin(origin);
    }

    return true;
  }
}
