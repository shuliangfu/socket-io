/**
 * @fileoverview Socket.IO 服务器
 * 管理 Socket.IO 服务器、连接、命名空间和事件
 */

import { createLogger, type Logger } from "@dreamer/logger";
import {
  serve,
  type ServeHandle,
  upgradeWebSocket,
} from "@dreamer/runtime-adapter";
import { $t, setSocketIoLocale } from "./i18n.ts";
import { MemoryAdapter } from "./adapters/memory.ts";
import type {
  AdapterMessage,
  AdapterSocketLike,
  SocketIOAdapter,
} from "./adapters/types.ts";
import { CompressionManager } from "./compression/compression-manager.ts";
import { EncryptionManager } from "./encryption/encryption-manager.ts";
import { AdaptivePollingTimeout } from "./engine/adaptive-polling-timeout.ts";
import { BatchHeartbeatManager } from "./engine/heartbeat-manager.ts";
import { PollingBatchHandler } from "./engine/polling-batch-handler.ts";
import { PollingTransport } from "./engine/polling-transport.ts";
import { EngineSocket } from "./engine/socket.ts";
import { WebSocketTransport } from "./engine/websocket-transport.ts";
import { HardwareAccelerator } from "./hardware-accel/accelerator.ts";
import { decodePacket, encodePacket } from "./socketio/parser.ts";
import type { ConnectionEventListener } from "./socketio/namespace.ts";
import { Namespace } from "./socketio/namespace.ts";
import { SocketIOSocket } from "./socketio/socket.ts";
import { StreamPacketProcessor } from "./streaming/stream-parser.ts";
import {
  EnginePacketType,
  Handshake,
  ServerOptions,
  TransportType,
} from "./types.ts";

/**
 * Socket.IO 服务器
 */
export class Server {
  /** 服务器配置 */
  public readonly options:
    & Required<
      Pick<
        ServerOptions,
        | "path"
        | "pingTimeout"
        | "pingInterval"
        | "transports"
        | "allowPolling"
        | "pollingTimeout"
      >
    >
    & ServerOptions;
  /** Engine.IO Socket 连接池 */
  private engineSockets: Map<string, EngineSocket> = new Map();
  /** 命名空间映射 */
  private namespaces: Map<string, Namespace> = new Map();
  /** connection 事件监听器（委托给默认命名空间） */
  private listeners: Map<string, ConnectionEventListener[]> = new Map();
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
  /** Logger 实例（统一日志输出） */
  private readonly logger: Logger;

  /**
   * 获取翻译文本：使用包内 $t（语言在构造时由 options.lang 设置），key 有翻译时返回翻译结果，否则返回 fallback
   * 供子模块（EngineSocket、适配器等）调用
   */
  tr(
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean>,
  ): string {
    const translated = $t(
      key,
      params as Record<string, string | number | boolean> | undefined,
    );
    return translated !== key ? translated : fallback;
  }

  /**
   * 调试日志：仅当 options.debug=true 时输出，使用 logger.debug（与 @dreamer/server 一致）
   */
  private debugLog(message: string): void {
    if (this.options.debug === true) {
      this.logger.debug(`[Socket.IO] ${message}`);
    }
  }

  /**
   * 创建 Socket.IO 服务器实例
   * @param options 服务器配置选项
   */
  constructor(options: ServerOptions = {}) {
    this.logger = options.logger || createLogger();

    this.options = {
      path: options.path || "/socket.io/",
      pingTimeout: options.pingTimeout || 20000,
      pingInterval: options.pingInterval || 25000,
      transports: options.transports || ["websocket", "polling"],
      allowPolling: options.allowPolling !== false,
      pollingTimeout: options.pollingTimeout || 60000,
      ...options,
    } as
      & Required<
        Pick<
          ServerOptions,
          | "path"
          | "pingTimeout"
          | "pingInterval"
          | "transports"
          | "allowPolling"
          | "pollingTimeout"
        >
      >
      & ServerOptions;

    // 若指定了 lang，在构造时设置语言，后续 tr() 将使用该 locale
    if (this.options.lang !== undefined) {
      setSocketIoLocale(this.options.lang);
    }

    // 创建或使用提供的适配器
    this.adapter = this.options.adapter || new MemoryAdapter();
    // 将 logger 注入适配器（若适配器支持）
    this.adapter.setLogger?.(this.logger);

    // 生成服务器 ID
    this.serverId = `server-${Date.now()}-${
      Math.random().toString(36).substring(2, 9)
    }`;

    // 创建默认命名空间
    const defaultNamespace = new Namespace(
      "/",
      this.adapter,
      this.accelerator,
      this.logger,
      this,
    );
    this.namespaces.set("/", defaultNamespace);

    // 创建批量心跳管理器
    this.heartbeatManager = new BatchHeartbeatManager(
      this.options.pingInterval,
      this.options.pingTimeout,
      this.logger,
      (key, fallback, params) => this.tr(key, fallback, params),
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
        logger: this.logger,
        tr: (key, fallback, params) => this.tr(key, fallback, params),
      });
    }

    // 创建流式处理器（如果启用流式处理）
    if (this.options.streaming) {
      // 流式处理器会在需要时创建（每个连接一个）
      // maxPacketSize 会在创建流式处理器时使用
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
              const request = new Request("http://localhost/polling", {
                method: "GET",
              });
              const response = await transport.handlePoll(request);
              responses.set(sid, response);
            } catch (error) {
              // 如果处理失败，返回错误响应
              this.logger.error(
                this.tr(
                  "log.socketio.pollingBatchFailed",
                  `轮询批量处理失败 (sid: ${sid})`,
                  { sid },
                ),
                error,
              );
              responses.set(
                sid,
                new Response("Internal Server Error", { status: 500 }),
              );
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
   *
   * 启动 HTTP 服务器并开始监听连接。在启动前会：
   * 1. 初始化分布式适配器
   * 2. 订阅适配器消息
   * 3. 创建 HTTP 服务器并开始监听
   *
   * @param host - 主机地址（可选），默认为配置中的 host 或 "0.0.0.0"
   * @param port - 端口号（可选），默认为配置中的 port 或 3000
   * @returns Promise<void> 服务器启动成功时解析
   *
   * @example
   * ```typescript
   * await server.listen("0.0.0.0", 3000);
   * console.log("服务器已启动");
   * ```
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

    const initResult = this.adapter.init(
      this.serverId,
      sockets as Map<string, AdapterSocketLike>,
    );
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
      (request: Request) => {
        return this.handleRequest(request);
      },
    );

    this.logger.info(
      this.tr(
        "log.socketio.serverRunning",
        `Socket.IO 服务器运行在 http://${serverHost}:${serverPort}${this.options.path}`,
        { host: serverHost, port: String(serverPort), path: this.options.path },
      ),
    );
  }

  /**
   * 处理单次 HTTP 请求（供挂载到现有 HTTP 服务器时使用）
   *
   * 当 Socket.IO 挂载到 dweb 等框架的同一端口时，由框架将路径前缀匹配的请求转发给本方法。
   *
   * @param request HTTP 请求
   * @returns HTTP 响应
   */
  handleIncomingRequest(request: Request): Promise<Response> {
    return this.handleRequest(request);
  }

  /**
   * 处理 HTTP 请求（内部实现）
   * @param request HTTP 请求
   * @returns HTTP 响应
   */
  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // 规范化 path：接受 /socket.io 与 /socket.io/，避免因尾部斜杠导致 404
    let path = url.pathname;
    const pathBase = this.options.path.replace(/\/$/, "");
    if (path === pathBase && !path.endsWith("/")) {
      path = this.options.path;
    }

    this.debugLog(
      this.tr(
        "log.socketio.requestReceived",
        `收到请求: ${request.method} ${path}${
          url.search ? `?${url.search}` : ""
        }`,
        { method: request.method, path, search: url.search || "" },
      ),
    );

    // 检查是否是 Socket.IO 路径
    if (!path.startsWith(this.options.path)) {
      this.debugLog(
        this.tr(
          "log.socketio.pathMismatch",
          "路径不匹配 pathPrefix，返回 404",
          { path },
        ),
      );
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
          this.debugLog(
            this.tr(
              "log.socketio.corsPreflight",
              "CORS 预检 OPTIONS，返回 200",
            ),
          );
          return new Response(null, { status: 200, headers });
        }
      }
    }

    // 解析路径：/socket.io/{transport}/{sid}?...
    const pathParts = path.slice(this.options.path.length).split("/");
    const transport = pathParts[0] as TransportType;
    const sid = pathParts[1];
    this.debugLog(
      this.tr(
        "log.socketio.parsePath",
        `解析路径: transport=${transport ?? "(空)"}, sid=${sid ?? "(无)"}`,
        { transport: transport ?? "(空)", sid: sid ?? "(无)" },
      ),
    );

    // 处理轮询传输
    if (transport === "polling") {
      this.debugLog(
        this.tr(
          "log.socketio.pollingEnter",
          `进入轮询处理 sid=${sid ?? "(无)"}`,
          { sid: sid ?? "(无)" },
        ),
      );
      const res = await this.handlePolling(request, sid);
      this.debugLog(
        this.tr("log.socketio.pollingReturn", `轮询返回: ${res.status}`, {
          status: String(res.status),
        }),
      );
      return res;
    }

    // 处理 WebSocket 传输
    if (transport === "websocket") {
      this.debugLog(
        this.tr(
          "log.socketio.websocketEnter",
          `进入 WebSocket 处理 sid=${sid ?? "(无)"}`,
          { sid: sid ?? "(无)" },
        ),
      );
      const res = this.handleWebSocket(request, sid);
      this.debugLog(
        this.tr(
          "log.socketio.websocketReturn",
          `WebSocket 返回: ${res.status}`,
          { status: String(res.status) },
        ),
      );
      return res;
    }

    // 处理 Engine.IO 握手
    if (path.endsWith("/") || path === this.options.path) {
      this.debugLog(
        this.tr(
          "log.socketio.handshakeStart",
          "执行握手（生成 sid、创建轮询传输）",
        ),
      );
      const res = this.handleHandshake(request);
      this.debugLog(
        this.tr("log.socketio.handshakeReturn", `握手返回: ${res.status}`, {
          status: String(res.status),
        }),
      );
      return res;
    }

    this.debugLog(
      this.tr(
        "log.socketio.noMatchBranch",
        "未匹配到处理分支（非握手/轮询/websocket），返回 404",
      ),
    );
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

    // 创建 Engine.IO Socket，传入 onClose 回调以便客户端断开时清理资源（防止内存泄漏）
    const sidForClose = sid;
    const engineSocket = new EngineSocket(
      sid,
      handshake,
      this.options.pingTimeout,
      this.options.pingInterval,
      () => this.onEngineSocketClose(sidForClose),
      (key, fallback, params) => this.tr(key, fallback, params),
      this.logger,
    );

    // 获取动态轮询超时时间
    const pollingTimeout = this.adaptivePollingTimeout.getTimeout();
    this.adaptivePollingTimeout.updateConnections(this.engineSockets.size + 1);

    // 创建轮询传输
    const pollingTransport = new PollingTransport(
      pollingTimeout,
      this.encryptionManager,
      this.logger,
      (key, fallback, params) => this.tr(key, fallback, params),
    );
    engineSocket.setTransport(pollingTransport);
    this.pollingTransports.set(sid, pollingTransport);
    this.engineSockets.set(sid, engineSocket);

    // 添加到批量心跳管理器（禁用独立心跳）
    engineSocket.disableHeartbeat();
    this.heartbeatManager.add(engineSocket);

    // 监听 Engine.IO 消息
    engineSocket.on(async (packet) => {
      if (
        packet.type === EnginePacketType.MESSAGE &&
        typeof packet.data === "string"
      ) {
        // 这是 Socket.IO 数据包，需要路由到命名空间
        await this.handleSocketIOMessage(engineSocket, packet.data);
      }
    });

    // 返回握手响应
    return new Response(
      JSON.stringify({
        sid,
        upgrades: ["websocket"],
        pingInterval: this.options.pingInterval,
        pingTimeout: this.options.pingTimeout,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  /**
   * 处理轮询传输请求
   * @param request HTTP 请求
   * @param sid Socket ID
   * @returns HTTP 响应
   */
  private async handlePolling(
    request: Request,
    sid: string | undefined,
  ): Promise<Response> {
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
    const hasPendingPackets = pollingTransport.hasPendingPackets();

    // 如果是 GET 请求（轮询等待），且批量处理器可用，且没有待发送的数据包，使用批量处理
    if (
      request.method === "GET" && this.pollingBatchHandler &&
      !pollingTransport.hasPendingPoll() && !hasPendingPackets
    ) {
      return new Promise<Response>((resolve) => {
        this.pollingBatchHandler!.addPoll(sid, resolve);
      });
    }

    // 否则直接处理（POST 请求、已有待处理请求、或有待发送的数据包）
    return await pollingTransport.handlePoll(request);
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
        this.logger,
        (key, fallback, params) => this.tr(key, fallback, params),
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
      this.logger.error(
        this.tr("log.socketio.upgradeFailed", "WebSocket 升级失败", {
          error: String(error),
        }),
        error,
      );
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  /**
   * Engine.IO Socket 关闭时回调，清理 engineSockets、pollingTransports、heartbeatManager，
   * 以及命名空间中的 Socket.IO Socket，防止客户端断开后资源泄漏
   * @param sid Socket ID
   */
  private onEngineSocketClose(sid: string): void {
    const engineSocket = this.engineSockets.get(sid);
    if (engineSocket) {
      this.engineSockets.delete(sid);
      this.heartbeatManager.remove(engineSocket);
    }
    const pollingTransport = this.pollingTransports.get(sid);
    if (pollingTransport) {
      pollingTransport.close();
      this.pollingTransports.delete(sid);
    }
    this.adaptivePollingTimeout.updateConnections(this.engineSockets.size);

    // 从所有命名空间中移除对应的 Socket.IO Socket（客户端断开时可能尚未完成 Socket.IO 握手）
    for (const namespace of this.namespaces.values()) {
      namespace.removeSocket(sid);
    }
  }

  /**
   * 处理 Socket.IO 消息
   * @param engineSocket Engine.IO Socket
   * @param data Socket.IO 数据包字符串
   */
  private async handleSocketIOMessage(
    engineSocket: EngineSocket,
    data: string,
  ): Promise<void> {
    // 解析 Socket.IO 数据包以获取命名空间
    let nsp = "/";
    try {
      const packet = decodePacket(data);
      nsp = packet.nsp || "/";
    } catch {
      // 解析失败，使用默认命名空间
      // 忽略解析错误
    }

    // 获取或创建命名空间
    let namespace = this.namespaces.get(nsp);
    if (!namespace) {
      namespace = new Namespace(
        nsp,
        this.adapter,
        this.accelerator,
        this.logger,
        this,
      );
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
      socket.processPacket(data);
    }
  }

  /**
   * 监听默认命名空间的连接事件
   *
   * 当有新的 Socket 连接到默认命名空间（"/"）时，会触发 connection 事件。
   * 这是 Server 级别的便捷方法，实际是代理到默认命名空间的 connection 事件。
   *
   * @param event - 事件名称，必须是 "connection"
   * @param listener - 监听器函数，接收 Socket 实例作为参数
   *
   * @throws {Error} 如果事件名称不是 "connection" 则抛出错误
   *
   * @example
   * ```typescript
   * server.on("connection", (socket) => {
   *   console.log("新连接:", socket.id);
   *   socket.emit("welcome", { message: "欢迎" });
   * });
   * ```
   */
  on(event: "connection", listener: ConnectionEventListener): void {
    if (event !== "connection") {
      throw new Error(
        this.tr("log.socketio.unsupportedEvent", `不支持的事件: ${event}`, {
          event,
        }),
      );
    }

    // 在默认命名空间上监听
    const defaultNamespace = this.namespaces.get("/");
    if (defaultNamespace) {
      defaultNamespace.on("connection", listener);
    }
  }

  /**
   * 获取或创建命名空间
   *
   * 如果命名空间已存在，直接返回。如果不存在，创建新的命名空间并返回。
   *
   * @param name - 命名空间名称，必须以 "/" 开头，例如 "/chat", "/game"
   * @returns 命名空间实例
   *
   * @example
   * ```typescript
   * // 获取默认命名空间
   * const defaultNamespace = server.of("/");
   *
   * // 创建或获取聊天命名空间
   * const chatNamespace = server.of("/chat");
   * chatNamespace.on("connection", (socket) => {
   *   console.log("用户加入聊天室");
   * });
   * ```
   */
  of(name: string): Namespace {
    if (!this.namespaces.has(name)) {
      const namespace = new Namespace(
        name,
        this.adapter,
        this.accelerator,
        this.logger,
        this,
      );
      this.namespaces.set(name, namespace);
    }
    return this.namespaces.get(name)!;
  }

  /**
   * 向默认命名空间的所有 Socket 发送事件（标准 Socket.IO API）
   *
   * 这是 Server 级别的便捷方法，实际是代理到默认命名空间的 emit 方法。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param data - 事件数据，可以是任意类型
   *
   * @example
   * ```typescript
   * // 向所有连接的 Socket 发送系统通知
   * server.emit("system-notification", { message: "系统维护中" });
   * ```
   */
  emit(event: string, data?: unknown): void {
    const defaultNamespace = this.namespaces.get("/");
    if (defaultNamespace) {
      defaultNamespace.emit(event, data);
    }
  }

  /**
   * 向默认命名空间的房间发送事件（标准 Socket.IO API）
   *
   * 这是 Server 级别的便捷方法，实际是代理到默认命名空间的 to 方法。
   * 返回一个链式调用对象，可以继续调用 `to()`, `in()`, `except()`, `compress()` 等方法。
   *
   * @param room - 房间名称
   * @returns 返回一个链式调用对象，包含 `emit`, `to`, `in`, `except`, `compress` 等方法
   *
   * @example
   * ```typescript
   * // 向房间发送消息
   * server.to("room-123").emit("message", { text: "Hello" });
   * ```
   */
  to(room: string): ReturnType<Namespace["to"]> {
    const defaultNamespace = this.namespaces.get("/");
    if (defaultNamespace) {
      return defaultNamespace.to(room);
    }
    // 如果默认命名空间不存在，返回一个空操作对象
    const noop = () => {};
    return {
      emit: noop,
      to: () => this.to(""),
      in: () => this.to(""),
      except: () => this.to(""),
      compress: () => this.to(""),
    } as ReturnType<Namespace["to"]>;
  }

  /**
   * 向默认命名空间的房间发送事件（标准 Socket.IO API，to 的别名）
   *
   * 功能与 `to()` 方法完全相同，只是为了提供更符合语义的 API。
   *
   * @param room - 房间名称
   * @returns 返回与 `to()` 方法相同的链式调用对象
   *
   * @example
   * ```typescript
   * server.in("room-123").emit("message", { text: "Hello" });
   * ```
   */
  in(room: string): ReturnType<Namespace["to"]> {
    return this.to(room);
  }

  /**
   * 排除指定的房间或 Socket ID（标准 Socket.IO API）
   *
   * 这是 Server 级别的便捷方法，实际是代理到默认命名空间的 except 方法。
   * 返回一个链式调用对象，可以配合 `to()` 或 `in()` 使用。
   *
   * @param room - 房间名称或 Socket ID，或数组（可以同时排除多个）
   * @returns 返回一个链式调用对象，包含 `emit`, `to`, `in`, `except`, `compress` 等方法
   *
   * @example
   * ```typescript
   * // 向房间发送消息，但排除特定 Socket
   * server.to("room-123").except("socket-id-456").emit("message", data);
   * ```
   */
  except(room: string | string[]): ReturnType<Namespace["except"]> {
    const defaultNamespace = this.namespaces.get("/");
    if (defaultNamespace) {
      return defaultNamespace.except(room);
    }
    // 如果默认命名空间不存在，返回一个空操作对象
    const noop = () => {};
    return {
      emit: noop,
      to: () => this.to(""),
      in: () => this.to(""),
      except: () => this.except(""),
      compress: () => this.except(""),
    } as ReturnType<Namespace["except"]>;
  }

  /**
   * 获取所有命名空间中所有连接的 Socket ID（标准 Socket.IO API）
   *
   * 遍历所有命名空间，收集所有已连接的 Socket ID。
   *
   * @returns Promise<Set<string>> Socket ID 集合
   *
   * @example
   * ```typescript
   * const socketIds = await server.allSockets();
   * console.log(`当前有 ${socketIds.size} 个连接`);
   * ```
   */
  async allSockets(): Promise<Set<string>> {
    // 标准 Socket.IO API 中 allSockets 是异步的（可能需要从适配器获取远程 socket）
    await Promise.resolve();
    const socketIds = new Set<string>();
    for (const namespace of this.namespaces.values()) {
      for (const socket of namespace.getSockets().values()) {
        if (socket.connected) {
          socketIds.add(socket.id);
        }
      }
    }
    return socketIds;
  }

  /**
   * 获取匹配条件下的 Socket 实例集（标准 Socket.IO API）
   *
   * 遍历所有命名空间，根据过滤条件收集 Socket 实例。
   *
   * @param filter - 过滤函数（可选），用于选择符合条件的 Socket
   * @returns Promise<SocketIOSocket[]> Socket 实例数组
   *
   * @example
   * ```typescript
   * // 获取所有 Socket
   * const allSockets = await server.fetchSockets();
   *
   * // 获取符合条件的 Socket
   * const userSockets = await server.fetchSockets((socket) => {
   *   return socket.data.userId === "user-123";
   * });
   * ```
   */
  async fetchSockets(
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<SocketIOSocket[]> {
    // 标准 Socket.IO API 中 fetchSockets 是异步的（可能需要从适配器获取远程 socket）
    await Promise.resolve();
    const sockets: SocketIOSocket[] = [];
    for (const namespace of this.namespaces.values()) {
      for (const socket of namespace.getSockets().values()) {
        if (socket.connected) {
          if (!filter || filter(socket)) {
            sockets.push(socket);
          }
        }
      }
    }
    return sockets;
  }

  /**
   * 批量让 Socket 加入房间（标准 Socket.IO API）
   *
   * 根据过滤条件选择 Socket，然后让它们加入指定的房间。
   * 操作会应用到所有命名空间。
   *
   * @param rooms - 房间名称或房间名称数组
   * @param filter - 过滤函数（可选），用于选择要加入房间的 Socket
   * @returns Promise<void> 操作完成时解析
   *
   * @example
   * ```typescript
   * // 让所有 Socket 加入房间
   * await server.socketsJoin("room-123");
   *
   * // 让符合条件的 Socket 加入多个房间
   * await server.socketsJoin(["room-1", "room-2"], (socket) => {
   *   return socket.data.userId === "user-123";
   * });
   * ```
   */
  async socketsJoin(
    rooms: string | string[],
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<void> {
    const roomArray = Array.isArray(rooms) ? rooms : [rooms];
    const sockets = await this.fetchSockets(filter);
    for (const socket of sockets) {
      for (const room of roomArray) {
        socket.join(room);
      }
    }
  }

  /**
   * 批量让 Socket 离开房间（标准 Socket.IO API）
   *
   * 根据过滤条件选择 Socket，然后让它们离开指定的房间。
   * 操作会应用到所有命名空间。
   *
   * @param rooms - 房间名称或房间名称数组
   * @param filter - 过滤函数（可选），用于选择要离开房间的 Socket
   * @returns Promise<void> 操作完成时解析
   *
   * @example
   * ```typescript
   * // 让所有 Socket 离开房间
   * await server.socketsLeave("room-123");
   *
   * // 让符合条件的 Socket 离开多个房间
   * await server.socketsLeave(["room-1", "room-2"], (socket) => {
   *   return socket.data.userId === "user-123";
   * });
   * ```
   */
  async socketsLeave(
    rooms: string | string[],
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<void> {
    const roomArray = Array.isArray(rooms) ? rooms : [rooms];
    const sockets = await this.fetchSockets(filter);
    for (const socket of sockets) {
      for (const room of roomArray) {
        socket.leave(room);
      }
    }
  }

  /**
   * 批量断开 Socket 连接（标准 Socket.IO API）
   *
   * 根据过滤条件选择 Socket，然后断开它们的连接。
   * 如果 `close` 为 true，还会关闭底层 Engine.IO 连接。
   * 操作会应用到所有命名空间。
   *
   * @param close - 是否关闭底层连接（默认：false），如果为 true 会强制关闭连接
   * @param filter - 过滤函数（可选），用于选择要断开的 Socket
   * @returns Promise<void> 操作完成时解析
   *
   * @example
   * ```typescript
   * // 断开所有 Socket 连接
   * await server.disconnectSockets();
   *
   * // 断开符合条件的 Socket 连接，并关闭底层连接
   * await server.disconnectSockets(true, (socket) => {
   *   return socket.data.userId === "user-123";
   * });
   * ```
   */
  async disconnectSockets(
    close = false,
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<void> {
    const sockets = await this.fetchSockets(filter);
    for (const socket of sockets) {
      socket.disconnect();
      if (close) {
        socket.getEngineSocket().close();
      }
    }
  }

  /**
   * 跨服务器实例广播事件（服务器端事件）
   * @param event 事件名称
   * @param data 事件数据
   */
  async serverSideEmit(event: string, ...data: any[]): Promise<void> {
    // 通过适配器广播到其他服务器
    if (this.adapter) {
      const message: AdapterMessage = {
        event: `server-side-${event}`,
        data,
      };
      const result = this.adapter.broadcast(message);
      if (result instanceof Promise) {
        await result;
      }
    }
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
    for (const [_sid, pollingTransport] of this.pollingTransports.entries()) {
      pollingTransport.close();
    }
    this.pollingTransports.clear();

    // 销毁心跳管理器
    this.heartbeatManager.destroy();

    // 重置动态轮询超时管理器（无定时器，仅重置连接数状态）
    this.adaptivePollingTimeout.reset();

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
    _fromServerId: string,
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
          if (
            socket && socket.connected && socketId !== message.excludeSocketId
          ) {
            if (message.packet) {
              // 如果有数据包，直接发送
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
