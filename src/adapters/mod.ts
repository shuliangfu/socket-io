/**
 * @fileoverview Socket.IO 适配器模块
 * 导出所有适配器实现
 */

export type { AdapterMessage, SocketIOAdapter } from "./types.ts";

export { MemoryAdapter } from "./memory.ts";
export { RedisAdapter } from "./redis.ts";
export type {
  RedisAdapterOptions,
  RedisClient,
  RedisConnectionConfig,
  RedisPubSubClient,
} from "./redis.ts";
export { MongoDBAdapter } from "./mongodb.ts";
export type {
  MongoDBAdapterOptions,
  MongoDBChangeStream,
  MongoDBClient,
  MongoDBCollection,
  MongoDBConnectionConfig,
  MongoDBCursor,
  MongoDBDatabase,
} from "./mongodb.ts";
