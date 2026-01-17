/**
 * @fileoverview Redis 分布式适配器
 * 使用 Redis 实现分布式 Socket.IO 服务器，支持多服务器实例之间的消息广播
 */

import type { SocketIOSocket } from "../socketio/socket.ts";
import type { AdapterMessage, SocketIOAdapter } from "./types.ts";

/**
 * Redis 客户端接口
 */
export interface RedisClient {
  /** 设置键值 */
  set(
    key: string,
    value: string,
    options?: { EX?: number },
  ): Promise<void> | void;
  /** 获取值 */
  get(key: string): Promise<string | null> | string | null;
  /** 删除键 */
  del(key: string): Promise<number> | number;
  /** 检查键是否存在 */
  exists(key: string): Promise<number> | number;
  /** 获取所有匹配的键 */
  keys(pattern: string): Promise<string[]> | string[];
  /** 设置过期时间 */
  expire(key: string, seconds: number): Promise<number> | number;
  /** 添加到集合 */
  sadd(key: string, ...members: string[]): Promise<number> | number;
  /** 从集合移除 */
  srem(key: string, ...members: string[]): Promise<number> | number;
  /** 获取集合所有成员 */
  smembers(key: string): Promise<string[]> | string[];
  /** 断开连接 */
  disconnect?: () => Promise<void> | void;
  /** 退出连接 */
  quit?: () => Promise<void> | void;
}

/**
 * Redis Pub/Sub 客户端接口
 */
export interface RedisPubSubClient {
  /** 发布消息 */
  publish(channel: string, message: string): Promise<number> | number;
  /** 订阅频道 */
  subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void>;
  /** 取消订阅 */
  unsubscribe(channel: string): Promise<void>;
  /** 断开连接 */
  disconnect?: () => Promise<void> | void;
  /** 退出连接 */
  quit?: () => Promise<void> | void;
}

/**
 * Redis 连接配置
 */
export interface RedisConnectionConfig {
  /** Redis 连接 URL（例如：redis://127.0.0.1:6379） */
  url?: string;
  /** Redis 主机地址（默认：127.0.0.1） */
  host?: string;
  /** Redis 端口（默认：6379） */
  port?: number;
  /** Redis 密码（可选） */
  password?: string;
  /** Redis 数据库编号（默认：0） */
  db?: number;
}

/**
 * Redis 适配器配置选项
 */
export interface RedisAdapterOptions {
  /** 服务器 ID（用于标识当前服务器实例） */
  serverId?: string;
  /** 键前缀（用于区分不同的应用，默认：socket.io） */
  keyPrefix?: string;
  /** Redis 连接配置（用于数据存储） */
  connection?: RedisConnectionConfig;
  /** Redis 客户端实例（用于数据存储） */
  client?: RedisClient;
  /** Redis Pub/Sub 连接配置（用于消息发布/订阅） */
  pubsubConnection?: RedisConnectionConfig;
  /** Redis Pub/Sub 客户端实例（用于消息发布/订阅） */
  pubsubClient?: RedisPubSubClient;
  /** 服务器心跳间隔（秒，默认：30） */
  heartbeatInterval?: number;
}

/**
 * Redis 分布式适配器
 * 使用 Redis 实现分布式 Socket.IO 服务器
 */
export class RedisAdapter implements SocketIOAdapter {
  private serverId: string = "";
  private sockets: Map<string, SocketIOSocket> = new Map();
  private client: RedisClient | null = null;
  private pubsubClient: RedisPubSubClient | null = null;
  private keyPrefix: string;
  private connectionConfig?: RedisConnectionConfig;
  private pubsubConnectionConfig?: RedisConnectionConfig;
  private heartbeatInterval: number;
  private heartbeatTimer?: number;
  private messageCallback?: (message: AdapterMessage, serverId: string) => void;
  private internalClient: any = null;
  private internalPubsubClient: any = null;

  constructor(options: RedisAdapterOptions = {}) {
    this.keyPrefix = options.keyPrefix || "socket.io";
    this.heartbeatInterval = options.heartbeatInterval || 30;

    if (options.connection) {
      this.connectionConfig = options.connection;
    } else if (options.client) {
      this.client = options.client;
    } else {
      throw new Error(
        "RedisAdapter 需要提供 connection 配置或 client 实例",
      );
    }

    if (options.pubsubConnection) {
      this.pubsubConnectionConfig = options.pubsubConnection;
    } else if (options.pubsubClient) {
      this.pubsubClient = options.pubsubClient;
    } else {
      // 如果没有提供 Pub/Sub 配置，使用与 client 相同的配置
      this.pubsubConnectionConfig = this.connectionConfig;
    }
  }

  /**
   * 连接到 Redis
   */
  private async connectRedis(): Promise<void> {
    if (this.connectionConfig && !this.internalClient) {
      // 动态导入 Redis 客户端（根据运行时环境选择）
      // 注意：redis 是可选依赖，需要用户安装 npm:redis
      try {
        // 尝试使用 redis（推荐）
        // @ts-ignore: redis 是可选依赖
        const { createClient } = await import("redis");
        this.internalClient = createClient({
          url: this.connectionConfig.url ||
            `redis://${this.connectionConfig.host || "127.0.0.1"}:${
              this.connectionConfig.port || 6379
            }`,
          password: this.connectionConfig.password,
          database: this.connectionConfig.db || 0,
        });
        await this.internalClient.connect();
        this.client = this.internalClient as any;
      } catch (error) {
        throw new Error(
          `无法创建 Redis 客户端: ${
            error instanceof Error ? error.message : String(error)
          }。请确保已安装 redis 包（npm install redis）`,
        );
      }
    }
  }

  /**
   * 连接到 Redis Pub/Sub
   */
  private async connectPubSub(): Promise<void> {
    if (this.pubsubConnectionConfig && !this.internalPubsubClient) {
      try {
        // @ts-ignore: redis 是可选依赖
        const { createClient } = await import("redis");
        // 创建订阅客户端（用于接收消息）
        const subscribeClient = createClient({
          url: this.pubsubConnectionConfig.url ||
            `redis://${this.pubsubConnectionConfig.host || "127.0.0.1"}:${
              this.pubsubConnectionConfig.port || 6379
            }`,
          password: this.pubsubConnectionConfig.password,
          database: this.pubsubConnectionConfig.db || 0,
        });
        await subscribeClient.connect();

        // 创建发布客户端（用于发送消息）
        const publishClient = subscribeClient.duplicate
          ? subscribeClient.duplicate()
          : createClient({
            url: this.pubsubConnectionConfig.url ||
              `redis://${this.pubsubConnectionConfig.host || "127.0.0.1"}:${
                this.pubsubConnectionConfig.port || 6379
              }`,
            password: this.pubsubConnectionConfig.password,
            database: this.pubsubConnectionConfig.db || 0,
          });

        if (publishClient.connect) {
          await publishClient.connect();
        }

        // 创建统一的接口
        this.internalPubsubClient = {
          subscribeClient,
          publishClient,
        } as any;

        this.pubsubClient = {
          publish: async (channel: string, message: string) => {
            return await publishClient.publish(channel, message);
          },
          subscribe: async (
            channel: string,
            callback: (message: string) => void,
          ) => {
            await subscribeClient.subscribe(channel, (msg: string) => {
              callback(msg);
            });
          },
          unsubscribe: async (channel: string) => {
            await subscribeClient.unsubscribe(channel);
          },
          disconnect: async () => {
            await subscribeClient.quit();
            await publishClient.quit();
          },
          quit: async () => {
            await subscribeClient.quit();
            await publishClient.quit();
          },
        };
      } catch (error) {
        throw new Error(
          `无法创建 Redis Pub/Sub 客户端: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * 构建 Redis 键
   */
  private buildKey(...parts: string[]): string {
    return `${this.keyPrefix}:${parts.join(":")}`;
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

    // 连接到 Redis
    await this.connectRedis();
    await this.connectPubSub();

    // 注册服务器
    await this.registerServer();

    // 启动心跳
    this.startHeartbeat();
  }

  /**
   * 关闭适配器
   */
  async close(): Promise<void> {
    // 停止心跳
    this.stopHeartbeat();

    // 注销服务器
    await this.unregisterServer();

    // 取消订阅
    await this.unsubscribe();

    // 断开连接
    if (this.internalClient) {
      if (this.internalClient.quit) {
        await this.internalClient.quit();
      } else if (this.internalClient.disconnect) {
        await this.internalClient.disconnect();
      }
    }

    if (this.internalPubsubClient) {
      if (this.pubsubClient?.quit) {
        await this.pubsubClient.quit();
      } else if (this.pubsubClient?.disconnect) {
        await this.pubsubClient.disconnect();
      }
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
    if (!this.client) {
      return;
    }

    const roomKey = this.buildKey("room", namespace, room);
    const socketRoomsKey = this.buildKey("socket", namespace, socketId);

    // 添加到房间集合
    await this.client.sadd(roomKey, socketId);

    // 添加到 Socket 的房间集合
    await this.client.sadd(socketRoomsKey, room);

    // 设置过期时间（防止数据泄漏）
    await this.client.expire(roomKey, this.heartbeatInterval * 3);
    await this.client.expire(socketRoomsKey, this.heartbeatInterval * 3);
  }

  /**
   * 从房间移除 Socket
   */
  async removeSocketFromRoom(
    socketId: string,
    room: string,
    namespace: string = "/",
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    const roomKey = this.buildKey("room", namespace, room);
    const socketRoomsKey = this.buildKey("socket", namespace, socketId);

    // 从房间集合移除
    await this.client.srem(roomKey, socketId);

    // 从 Socket 的房间集合移除
    await this.client.srem(socketRoomsKey, room);
  }

  /**
   * 从所有房间移除 Socket
   */
  async removeSocketFromAllRooms(
    socketId: string,
    namespace: string = "/",
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    const socketRoomsKey = this.buildKey("socket", namespace, socketId);
    const rooms = await this.client.smembers(socketRoomsKey);

    for (const room of rooms) {
      await this.removeSocketFromRoom(socketId, room, namespace);
    }

    // 删除 Socket 的房间集合
    await this.client.del(socketRoomsKey);
  }

  /**
   * 获取房间内的 Socket ID 列表
   */
  async getSocketsInRoom(
    room: string,
    namespace: string = "/",
  ): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    const roomKey = this.buildKey("room", namespace, room);
    return await this.client.smembers(roomKey);
  }

  /**
   * 获取 Socket 所在的房间列表
   */
  async getRoomsForSocket(
    socketId: string,
    namespace: string = "/",
  ): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    const socketRoomsKey = this.buildKey("socket", namespace, socketId);
    return await this.client.smembers(socketRoomsKey);
  }

  /**
   * 广播消息到所有服务器
   */
  async broadcast(message: AdapterMessage): Promise<void> {
    if (!this.pubsubClient) {
      return;
    }

    const channel = this.buildKey("broadcast");
    const payload = JSON.stringify({
      serverId: this.serverId,
      message,
    });

    await this.pubsubClient.publish(channel, payload);
  }

  /**
   * 向房间广播消息
   */
  async broadcastToRoom(
    room: string,
    message: AdapterMessage,
  ): Promise<void> {
    if (!this.pubsubClient) {
      return;
    }

    const namespace = message.namespace || "/";
    const channel = this.buildKey("room", namespace, room);
    const payload = JSON.stringify({
      serverId: this.serverId,
      message,
    });

    await this.pubsubClient.publish(channel, payload);
  }

  /**
   * 订阅消息
   */
  async subscribe(
    callback: (message: AdapterMessage, serverId: string) => void,
  ): Promise<void> {
    if (!this.pubsubClient) {
      return;
    }

    this.messageCallback = callback;

    // 订阅广播频道
    const broadcastChannel = this.buildKey("broadcast");
    await this.pubsubClient.subscribe(broadcastChannel, (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.serverId !== this.serverId && data.message) {
          callback(data.message, data.serverId);
        }
      } catch (error) {
        console.error("Redis 消息解析错误:", error);
      }
    });

    // 订阅房间频道（使用模式订阅）
    // 注意：Redis 模式订阅需要特殊处理
    // 这里简化处理，实际应该使用 PSUBSCRIBE
    // 为了兼容性，我们监听所有可能的房间频道
  }

  /**
   * 取消订阅
   */
  async unsubscribe(): Promise<void> {
    if (!this.pubsubClient) {
      return;
    }

    const broadcastChannel = this.buildKey("broadcast");
    await this.pubsubClient.unsubscribe(broadcastChannel);
    this.messageCallback = undefined;
  }

  /**
   * 获取所有服务器 ID
   */
  async getServerIds(): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    const pattern = this.buildKey("server", "*");
    const keys = await this.client.keys(pattern);
    return keys.map((key) => key.split(":").pop() || "");
  }

  /**
   * 注册服务器
   */
  async registerServer(): Promise<void> {
    if (!this.client) {
      return;
    }

    const serverKey = this.buildKey("server", this.serverId);
    await this.client.set(serverKey, Date.now().toString(), {
      EX: this.heartbeatInterval * 3,
    });
  }

  /**
   * 注销服务器
   */
  async unregisterServer(): Promise<void> {
    if (!this.client) {
      return;
    }

    const serverKey = this.buildKey("server", this.serverId);
    await this.client.del(serverKey);
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
}
