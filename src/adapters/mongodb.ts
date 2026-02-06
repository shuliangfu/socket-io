/**
 * @fileoverview MongoDB 分布式适配器
 * 使用 MongoDB 实现分布式 Socket.IO 服务器
 *
 * 实现说明：
 * - 使用 MongoDB 集合存储房间和 Socket 关系
 * - 优先使用 Change Streams 监听消息变更（需要副本集模式）
 * - 如果 Change Streams 不可用，自动降级到轮询方案（支持单节点）
 * - 使用 TTL 索引自动清理过期数据
 *
 * 工作模式：
 * 1. 副本集模式：使用 Change Streams，实时监听消息变更（推荐，性能更好）
 * 2. 单节点模式：使用轮询，每 500ms 检查一次新消息（自动降级，延迟较高）
 */

import { MongoClient } from "mongodb";
import type { SocketIOSocket } from "../socketio/socket.ts";
import type { AdapterMessage, SocketIOAdapter } from "./types.ts";

/**
 * MongoDB 客户端接口
 */
export interface MongoDBClient {
  /** 连接 */
  connect(): Promise<void>;
  /** 断开连接 */
  close(): Promise<void>;
  /** 获取数据库 */
  db(name: string): MongoDBDatabase;
}

/**
 * MongoDB 数据库接口
 */
export interface MongoDBDatabase {
  /** 获取集合 */
  collection(name: string): MongoDBCollection;
}

/**
 * MongoDB 集合接口
 */
export interface MongoDBCollection {
  /** 插入文档 */
  insertOne(doc: any): Promise<any>;
  /** 更新文档 */
  updateOne(filter: any, update: any, options?: any): Promise<any>;
  /** 删除文档 */
  deleteOne(filter: any): Promise<any>;
  /** 查找文档 */
  find(filter?: any): MongoDBCursor;
  /** 查找一个文档 */
  findOne(filter: any): Promise<any>;
  /** 创建索引 */
  createIndex(keys: any, options?: any): Promise<string>;
  /** 监听变更流 */
  watch(pipeline?: any[]): MongoDBChangeStream;
}

/**
 * MongoDB 游标接口
 */
export interface MongoDBCursor {
  /** 转换为数组 */
  toArray(): Promise<any[]>;
}

/**
 * MongoDB 变更流接口
 */
export interface MongoDBChangeStream {
  /** 监听变更 */
  on(event: string, callback: (change: any) => void): void;
  /** 关闭变更流 */
  close(): Promise<void>;
}

/**
 * MongoDB 连接配置
 */
export interface MongoDBConnectionConfig {
  /** MongoDB 连接 URL */
  url?: string;
  /** 主机地址（默认：127.0.0.1） */
  host?: string;
  /** 端口（默认：27017） */
  port?: number;
  /** 数据库名称 */
  database: string;
  /** 用户名（可选） */
  username?: string;
  /** 密码（可选） */
  password?: string;
  /** 副本集名称（可选，用于启用 Change Streams） */
  replicaSet?: string;
  /** 是否直接连接（可选） */
  directConnection?: boolean;
}

/**
 * MongoDB 适配器配置选项
 */
export interface MongoDBAdapterOptions {
  /** 服务器 ID（用于标识当前服务器实例） */
  serverId?: string;
  /** 键前缀（用于区分不同的应用，默认：socket.io） */
  keyPrefix?: string;
  /** MongoDB 连接配置 */
  connection: MongoDBConnectionConfig;
  /** 服务器心跳间隔（秒，默认：30） */
  heartbeatInterval?: number;
  /** 翻译函数（可选，用于 i18n） */
  t?: (
    key: string,
    params?: Record<string, string | number | boolean>,
  ) => string | undefined;
}

/**
 * MongoDB 分布式适配器
 */
export class MongoDBAdapter implements SocketIOAdapter {
  private serverId: string = "";
  private sockets: Map<string, SocketIOSocket> = new Map();
  private connectionConfig: MongoDBConnectionConfig;
  private heartbeatInterval: number;
  private keyPrefix: string;
  private client: MongoDBClient | null = null;
  private db: MongoDBDatabase | null = null;
  private roomsCollection: MongoDBCollection | null = null;
  private messagesCollection: MongoDBCollection | null = null;
  private serversCollection: MongoDBCollection | null = null;
  private changeStream: MongoDBChangeStream | null = null;
  private messageCallback?: (message: AdapterMessage, serverId: string) => void;
  private heartbeatTimer?: number;
  private internalClient: any = null;
  private pollingTimer?: number;
  private useChangeStreams: boolean = true;
  private tr: (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean>,
  ) => string;

  constructor(options: MongoDBAdapterOptions) {
    this.connectionConfig = options.connection;
    this.heartbeatInterval = options.heartbeatInterval || 30;
    this.keyPrefix = options.keyPrefix || "socket.io";
    this.tr = (key, fallback, params) => {
      const r = options.t?.(key, params);
      return (r != null && r !== key) ? r : fallback;
    };
  }

  /**
   * 连接到 MongoDB
   */
  private async connectMongoDB(): Promise<void> {
    try {
      const url = this.buildConnectionUrl();
      this.internalClient = new MongoClient(url);
      await this.internalClient.connect();
      this.client = this.internalClient as any;
      if (this.client) {
        this.db = this.client.db(this.connectionConfig.database);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("Cannot resolve") ||
          error.message.includes("not found") ||
          error.message.includes("Failed to resolve") ||
          error.message.includes("Cannot find module"))
      ) {
        throw new Error(
          this.tr(
            "log.socketioAdapter.mongoClientNotInstalled",
            "MongoDB 客户端未安装。请安装 mongodb 包：deno add npm:mongodb",
          ),
        );
      }

      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      if (
        errorMessage.includes("replica set") ||
        errorMessage.includes("replicaSet") ||
        errorMessage.includes("not a replica set")
      ) {
        throw new Error(
          this.tr(
            "log.socketioAdapter.mongoConnectFailedReplicaSet",
            `连接 MongoDB 失败（副本集相关）: ${errorMessage}\n` +
              `提示：如果使用单节点副本集，请在配置中添加 replicaSet 参数`,
            { error: errorMessage },
          ),
        );
      }

      throw new Error(
        this.tr(
          "log.socketioAdapter.mongoConnectFailed",
          `连接 MongoDB 失败: ${errorMessage}`,
          { error: errorMessage },
        ),
      );
    }
  }

  /**
   * 构建连接 URL
   */
  private buildConnectionUrl(): string {
    const config = this.connectionConfig;
    if (config.url) {
      const url = new URL(config.url);
      const params = new URLSearchParams(url.search);

      if (config.replicaSet && !params.has("replicaSet")) {
        params.set("replicaSet", config.replicaSet);
      }

      if (
        config.directConnection !== undefined && !params.has("directConnection")
      ) {
        params.set("directConnection", String(config.directConnection));
      } else if (config.replicaSet && !params.has("directConnection")) {
        params.set("directConnection", "false");
      }

      url.search = params.toString();
      return url.toString();
    }

    const host = config.host || "127.0.0.1";
    const port = config.port || 27017;
    const database = config.database;

    const params = new URLSearchParams();
    if (config.replicaSet) {
      params.set("replicaSet", config.replicaSet);
      params.set("directConnection", "false");
    }
    if (config.directConnection !== undefined) {
      params.set("directConnection", String(config.directConnection));
    }

    const queryString = params.toString();
    const query = queryString ? `?${queryString}` : "";

    if (config.username && config.password) {
      return `mongodb://${config.username}:${config.password}@${host}:${port}/${database}${query}`;
    }

    return `mongodb://${host}:${port}/${database}${query}`;
  }

  /**
   * 初始化集合
   */
  private async initializeCollections(): Promise<void> {
    if (!this.db) {
      throw new Error(
        this.tr(
          "log.socketioAdapter.mongoDatabaseNotConnected",
          "MongoDB 数据库未连接",
        ),
      );
    }

    this.roomsCollection = this.db.collection(`${this.keyPrefix}_rooms`);
    this.messagesCollection = this.db.collection(`${this.keyPrefix}_messages`);
    this.serversCollection = this.db.collection(`${this.keyPrefix}_servers`);

    // 创建 TTL 索引
    try {
      if (this.messagesCollection?.createIndex) {
        await this.messagesCollection.createIndex(
          { createdAt: 1 },
          { expireAfterSeconds: 60 },
        );
      }
      if (this.serversCollection?.createIndex) {
        await this.serversCollection.createIndex(
          { lastHeartbeat: 1 },
          { expireAfterSeconds: this.heartbeatInterval * 3 },
        );
      }
    } catch (error) {
      // 忽略索引创建错误（可能已存在）
      console.warn(
        this.tr(
          "log.socketioAdapter.mongoCreateIndexFailed",
          "创建索引失败（可能已存在）",
        ),
        error,
      );
    }
  }

  /**
   * 初始化适配器
   */
  async init(
    serverId: string,
    sockets: Map<string, SocketIOSocket>,
  ): Promise<void> {
    this.serverId = serverId;
    this.sockets = sockets;

    await this.connectMongoDB();
    await this.initializeCollections();
    await this.registerServer();
    this.startHeartbeat();

    // 尝试订阅消息变更
    const subscribeResult = this.subscribe((_message, fromServerId) => {
      if (fromServerId === this.serverId) {
        return;
      }
    });
    if (subscribeResult instanceof Promise) {
      await subscribeResult;
    }
  }

  /**
   * 关闭适配器
   */
  async close(): Promise<void> {
    this.stopHeartbeat();
    this.stopPolling();

    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
    }

    await this.unregisterServer();

    if (this.internalClient) {
      await this.internalClient.close();
    }
  }

  /**
   * 添加 Socket 到房间
   */
  async addSocketToRoom(
    socketId: string,
    room: string,
    namespace: string = "/",
  ): Promise<void> {
    if (!this.roomsCollection) {
      return;
    }

    const roomKey = `${namespace}:${room}`;
    const socketRoomsKey = `${namespace}:${socketId}`;

    // 更新房间文档
    await this.roomsCollection.updateOne(
      { _id: roomKey },
      {
        $set: { _id: roomKey, namespace, room },
        $addToSet: { socketIds: socketId },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    // 更新 Socket 的房间文档
    await this.roomsCollection.updateOne(
      { _id: socketRoomsKey },
      {
        $set: { _id: socketRoomsKey, namespace, socketId },
        $addToSet: { rooms: room },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  }

  /**
   * 从房间移除 Socket
   */
  async removeSocketFromRoom(
    socketId: string,
    room: string,
    namespace: string = "/",
  ): Promise<void> {
    if (!this.roomsCollection) {
      return;
    }

    const roomKey = `${namespace}:${room}`;
    const socketRoomsKey = `${namespace}:${socketId}`;

    // 从房间文档移除 Socket
    await this.roomsCollection.updateOne(
      { _id: roomKey },
      { $pull: { socketIds: socketId } },
    );

    // 从 Socket 的房间文档移除房间
    await this.roomsCollection.updateOne(
      { _id: socketRoomsKey },
      { $pull: { rooms: room } },
    );
  }

  /**
   * 从所有房间移除 Socket
   */
  async removeSocketFromAllRooms(
    socketId: string,
    namespace: string = "/",
  ): Promise<void> {
    if (!this.roomsCollection) {
      return;
    }

    const socketRoomsKey = `${namespace}:${socketId}`;
    const socketDoc = await this.roomsCollection.findOne({
      _id: socketRoomsKey,
    });

    if (socketDoc && socketDoc.rooms) {
      for (const room of socketDoc.rooms) {
        await this.removeSocketFromRoom(socketId, room, namespace);
      }
    }

    // 删除 Socket 的房间文档
    await this.roomsCollection.deleteOne({ _id: socketRoomsKey });
  }

  /**
   * 获取房间内的 Socket ID 列表
   */
  async getSocketsInRoom(
    room: string,
    namespace: string = "/",
  ): Promise<string[]> {
    if (!this.roomsCollection) {
      return [];
    }

    const roomKey = `${namespace}:${room}`;
    const roomDoc = await this.roomsCollection.findOne({ _id: roomKey });
    return roomDoc?.socketIds || [];
  }

  /**
   * 获取 Socket 所在的房间列表
   */
  async getRoomsForSocket(
    socketId: string,
    namespace: string = "/",
  ): Promise<string[]> {
    if (!this.roomsCollection) {
      return [];
    }

    const socketRoomsKey = `${namespace}:${socketId}`;
    const socketDoc = await this.roomsCollection.findOne({
      _id: socketRoomsKey,
    });
    return socketDoc?.rooms || [];
  }

  /**
   * 广播消息到所有服务器
   */
  async broadcast(message: AdapterMessage): Promise<void> {
    if (!this.messagesCollection) {
      return;
    }

    await this.messagesCollection.insertOne({
      type: "broadcast",
      serverId: this.serverId,
      message,
      createdAt: new Date(),
    });
  }

  /**
   * 向房间广播消息
   */
  async broadcastToRoom(
    room: string,
    message: AdapterMessage,
  ): Promise<void> {
    if (!this.messagesCollection) {
      return;
    }

    const namespace = message.namespace || "/";
    await this.messagesCollection.insertOne({
      type: "room",
      room: `${namespace}:${room}`,
      serverId: this.serverId,
      message,
      createdAt: new Date(),
    });
  }

  /**
   * 订阅消息
   */
  subscribe(
    callback: (message: AdapterMessage, serverId: string) => void,
  ): void | Promise<void> {
    if (!this.messagesCollection) {
      return;
    }

    this.messageCallback = callback;

    // 尝试使用 Change Streams
    try {
      this.changeStream = this.messagesCollection.watch([
        { $match: { serverId: { $ne: this.serverId } } },
      ]);

      this.changeStream.on("change", (change: any) => {
        if (change.operationType === "insert" && change.fullDocument) {
          const doc = change.fullDocument;
          if (doc.message && doc.serverId !== this.serverId) {
            callback(doc.message, doc.serverId);
          }
        }
      });

      this.useChangeStreams = true;
      return Promise.resolve();
    } catch (error) {
      // Change Streams 不可用，降级到轮询
      console.warn(
        this.tr(
          "log.socketioAdapter.mongoChangeStreamsUnavailable",
          "Change Streams 不可用，降级到轮询模式",
        ),
        error instanceof Error ? error.message : String(error),
      );
      this.useChangeStreams = false;
      this.startPolling();
      return Promise.resolve();
    }
  }

  /**
   * 取消订阅
   */
  async unsubscribe(): Promise<void> {
    this.stopPolling();

    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
    }

    this.messageCallback = undefined;
  }

  /**
   * 获取所有服务器 ID
   */
  async getServerIds(): Promise<string[]> {
    if (!this.serversCollection) {
      return [];
    }

    const servers = await this.serversCollection.find({}).toArray();
    return servers.map((s) => s.serverId || "").filter(Boolean);
  }

  /**
   * 注册服务器
   */
  async registerServer(): Promise<void> {
    if (!this.serversCollection) {
      return;
    }

    await this.serversCollection.updateOne(
      { serverId: this.serverId },
      {
        $set: {
          serverId: this.serverId,
          lastHeartbeat: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /**
   * 注销服务器
   */
  async unregisterServer(): Promise<void> {
    if (!this.serversCollection) {
      return;
    }

    await this.serversCollection.deleteOne({ serverId: this.serverId });
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.registerServer();
    }, this.heartbeatInterval * 1000) as unknown as number;
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * 启动轮询（降级方案）
   */
  private startPolling(): void {
    if (this.pollingTimer) {
      return;
    }

    this.pollingTimer = setInterval(async () => {
      await this.pollMessages();
    }, 500) as unknown as number;
  }

  /**
   * 停止轮询
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  /**
   * 轮询消息
   */
  private async pollMessages(): Promise<void> {
    if (!this.messagesCollection || !this.messageCallback) {
      return;
    }

    try {
      // 查找来自其他服务器的消息
      const messages = await this.messagesCollection.find({
        serverId: { $ne: this.serverId },
        createdAt: { $gte: new Date(Date.now() - 1000) }, // 最近 1 秒的消息
      }).toArray();

      for (const doc of messages) {
        if (doc.message && doc.serverId !== this.serverId) {
          this.messageCallback(doc.message, doc.serverId);
        }
      }
    } catch (error) {
      console.error(
        this.tr(
          "log.socketioAdapter.mongoPollingError",
          "轮询消息错误",
        ),
        error,
      );
    }
  }
}
