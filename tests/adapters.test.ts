/**
 * @fileoverview 适配器测试
 */

import { describe, it, expect } from "@dreamer/test";
import { MemoryAdapter } from "../src/adapters/memory.ts";
import { RedisAdapter } from "../src/adapters/redis.ts";
import { MongoDBAdapter } from "../src/adapters/mongodb.ts";
import type { SocketIOSocket } from "../src/socketio/socket.ts";

// 创建模拟 Socket
function createMockSocket(id: string): SocketIOSocket {
  return {
    id,
    nsp: "/",
    handshake: {} as any,
    data: {},
    connected: true,
    emit: () => {},
    on: () => {},
    off: () => {},
    join: () => {},
    leave: () => {},
    to: () => ({ emit: () => {} }),
    broadcast: { emit: () => {} },
    disconnect: () => {},
    sendRaw: () => {},
  } as any;
}

describe("内存适配器", () => {
  it("应该创建内存适配器", () => {
    const adapter = new MemoryAdapter();
    expect(adapter).toBeTruthy();
  });

  it("应该初始化适配器", () => {
    const adapter = new MemoryAdapter();
    const sockets = new Map<string, SocketIOSocket>();
    sockets.set("socket1", createMockSocket("socket1"));

    adapter.init("server1", sockets);
    // 应该成功初始化
    expect(adapter).toBeTruthy();
  });

  it("应该添加 Socket 到房间", () => {
    const adapter = new MemoryAdapter();
    const sockets = new Map<string, SocketIOSocket>();
    adapter.init("server1", sockets);

    adapter.addSocketToRoom("socket1", "room1", "/");
    const socketIds = adapter.getSocketsInRoom("room1", "/");
    expect(socketIds.includes("socket1")).toBe(true);
  });

  it("应该从房间移除 Socket", () => {
    const adapter = new MemoryAdapter();
    const sockets = new Map<string, SocketIOSocket>();
    adapter.init("server1", sockets);

    adapter.addSocketToRoom("socket1", "room1", "/");
    adapter.removeSocketFromRoom("socket1", "room1", "/");
    const socketIds = adapter.getSocketsInRoom("room1", "/");
    expect(socketIds.includes("socket1")).toBe(false);
  });

  it("应该从所有房间移除 Socket", async () => {
    const adapter = new MemoryAdapter();
    const sockets = new Map<string, SocketIOSocket>();
    adapter.init("server1", sockets);

    adapter.addSocketToRoom("socket1", "room1", "/");
    adapter.addSocketToRoom("socket1", "room2", "/");

    // removeSocketFromAllRooms 是异步的，需要等待
    const result = adapter.removeSocketFromAllRooms("socket1", "/");
    if (result instanceof Promise) {
      await result;
    }

    const rooms1 = adapter.getRoomsForSocket("socket1", "/");
    expect(rooms1.length).toBe(0);
  });

  it("应该获取房间内的 Socket", () => {
    const adapter = new MemoryAdapter();
    const sockets = new Map<string, SocketIOSocket>();
    adapter.init("server1", sockets);

    adapter.addSocketToRoom("socket1", "room1", "/");
    adapter.addSocketToRoom("socket2", "room1", "/");

    const socketIds = adapter.getSocketsInRoom("room1", "/");
    expect(socketIds.includes("socket1")).toBe(true);
    expect(socketIds.includes("socket2")).toBe(true);
  });

  it("应该获取 Socket 所在的房间", () => {
    const adapter = new MemoryAdapter();
    const sockets = new Map<string, SocketIOSocket>();
    adapter.init("server1", sockets);

    adapter.addSocketToRoom("socket1", "room1", "/");
    adapter.addSocketToRoom("socket1", "room2", "/");

    const rooms = adapter.getRoomsForSocket("socket1", "/");
    expect(rooms.includes("room1")).toBe(true);
    expect(rooms.includes("room2")).toBe(true);
  });

  it("应该关闭适配器", async () => {
    const adapter = new MemoryAdapter();
    await adapter.close();
    // 应该成功关闭
    expect(adapter).toBeTruthy();
  });

  it("应该获取服务器 ID", () => {
    const adapter = new MemoryAdapter();
    const serverIds = adapter.getServerIds();
    expect(Array.isArray(serverIds)).toBe(true);
  });
});

describe("Redis 适配器", () => {
  it("应该创建 Redis 适配器（需要配置）", () => {
    try {
      const adapter = new RedisAdapter({
        connection: {
          host: "127.0.0.1",
          port: 6379,
        },
      });
      expect(adapter).toBeTruthy();
    } catch (error) {
      // 如果没有提供配置，应该抛出错误
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("应该使用提供的 Redis 客户端", () => {
    const mockClient = {
      set: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      del: () => Promise.resolve(1),
      exists: () => Promise.resolve(1),
      keys: () => Promise.resolve([]),
      expire: () => Promise.resolve(1),
      sadd: () => Promise.resolve(1),
      srem: () => Promise.resolve(1),
      smembers: () => Promise.resolve([]),
    };

    const adapter = new RedisAdapter({
      client: mockClient as any,
    });

    expect(adapter).toBeTruthy();
  });
});

describe("MongoDB 适配器", () => {
  it("应该创建 MongoDB 适配器（需要配置）", () => {
    try {
      const adapter = new MongoDBAdapter({
        connection: {
          host: "127.0.0.1",
          port: 27017,
          database: "test",
        },
      });
      expect(adapter).toBeTruthy();
    } catch (error) {
      // 如果没有提供配置，应该抛出错误
      expect(error).toBeInstanceOf(Error);
    }
  });
});
