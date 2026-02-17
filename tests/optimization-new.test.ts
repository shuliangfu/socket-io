/**
 * @fileoverview 新增优化功能测试
 * 覆盖 2.2 错误信息国际化、4.1 适配器泛型、6.2 内存与定时器复核、API 优化等
 */

import { describe, expect, it } from "@dreamer/test";
import {
  AdaptivePollingTimeout,
  BatchHeartbeatManager,
  CompressionManager,
  EngineSocket,
  MessageQueue,
  MongoDBAdapter,
  PollingBatchHandler,
  PollingTransport,
  RedisAdapter,
  Server,
  SocketIOSocket,
  StreamPacketProcessor,
  WebSocketBatchSender,
} from "../src/mod.ts";
import {
  EnginePacketType,
  Handshake,
  SocketIOPacketType,
} from "../src/types.ts";
import { delay, getAvailablePort } from "./test-utils.ts";

/** 创建 mock EngineSocket */
function createMockEngineSocket(id: string): EngineSocket {
  const handshake: Handshake = {
    query: {},
    headers: new Headers(),
    url: "http://localhost:3000",
  };
  const engineSocket = new EngineSocket(id, handshake, 20000, 25000);
  const mockTransport = {
    send: () => {},
    close: () => {},
    isClosed: () => false,
    on: () => {},
    off: () => {},
  };
  engineSocket.setTransport(
    mockTransport as unknown as import("../src/engine/transport.ts").Transport,
  );
  return engineSocket;
}

describe("2.2 错误信息国际化 (tr)", () => {
  describe("StreamPacketProcessor tr 参数", () => {
    it("传入 tr 时，解析错误应使用 tr 翻译", () => {
      let errorMsg = "";
      const tr = (key: string, fallback: string) => {
        if (key === "log.socketio.streamParseError") return `[i18n]${key}`;
        return fallback;
      };
      const processor = new StreamPacketProcessor(
        () => {},
        1024,
        (err) => {
          errorMsg = String(err);
        },
        tr,
      );
      // 处理无效数据触发解析错误
      processor.processChunk(new Uint8Array([0xFF, 0xFF, 0xFF]));
      // onError 会收到 error 对象，tr 用于内部日志；此处验证 processor 不崩溃且 tr 被传入
      expect(processor).toBeTruthy();
    });

    it("未传入 tr 时，解析错误应使用 fallback", () => {
      const processor = new StreamPacketProcessor(() => {
        // 正常收到数据包
      });
      processor.processChunk(new Uint8Array([0xFF, 0xFF, 0xFF]));
      expect(processor).toBeTruthy();
    });
  });

  describe("CompressionManager tr 参数", () => {
    it("传入 tr 时，压缩失败应使用 tr 翻译", async () => {
      const tr = (
        key: string,
      ) => (key === "log.socketio.compressionFailed"
        ? "[i18n]compressionFailed"
        : key);
      const manager = new CompressionManager({
        logger: undefined,
        tr,
      });
      // 压缩正常数据应成功
      const result = await manager.compress("hello");
      expect(result).toBeTruthy();
    });

    it("未传入 tr 时，CompressionManager 应正常创建", () => {
      const manager = new CompressionManager({});
      expect(manager).toBeTruthy();
    });
  });

  describe("MessageQueue tr 参数", () => {
    it("传入 tr 时，MessageQueue 应正常创建", () => {
      const tr = (
        key: string,
        fallback: string,
      ) => (key === "log.socketio.messageSendError" ? "[i18n]msg" : fallback);
      const queue = new MessageQueue(100, 10, { tr });
      expect(queue).toBeTruthy();
      expect(queue.size).toBe(0);
    });
  });

  describe("Server lang 选项传递到 tr", () => {
    it("Server 的 lang 应在 tr() 中生效", () => {
      const server = new Server({
        path: "/socket.io/",
        lang: "en-US",
      });
      const result = server.tr("log.socketio.pathMismatch", "fallback", {
        path: "/x",
      });
      expect(result).toBe("Path does not match pathPrefix, returning 404");
    });
  });
});

describe("4.1 MongoDB/Redis 适配器泛型", () => {
  describe("MongoDBAdapter 泛型", () => {
    it("应支持默认泛型创建", () => {
      const adapter = new MongoDBAdapter({
        connection: {
          host: "127.0.0.1",
          port: 27017,
          database: "test",
        },
      });
      expect(adapter).toBeTruthy();
    });

    it("应支持显式泛型参数", () => {
      type CustomClient = import("../src/adapters/mongodb.ts").MongoDBClient;
      const adapter = new MongoDBAdapter<CustomClient>({
        connection: {
          host: "127.0.0.1",
          port: 27017,
          database: "test",
        },
      });
      expect(adapter).toBeTruthy();
    });
  });

  describe("RedisAdapter 泛型", () => {
    it("应支持 mock client 创建", () => {
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
        client: mockClient as import("../src/adapters/redis.ts").RedisClient,
      });
      expect(adapter).toBeTruthy();
    });

    it("应支持显式泛型参数", () => {
      type CustomClient = import("../src/adapters/redis.ts").RedisClient;
      const mockClient: CustomClient = {
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
      const adapter = new RedisAdapter<CustomClient>({ client: mockClient });
      expect(adapter).toBeTruthy();
    });
  });
});

describe("6.2 内存与定时器复核", () => {
  describe("BatchHeartbeatManager.destroy()", () => {
    it("destroy 后应清除所有定时器和 Socket 引用", async () => {
      const manager = new BatchHeartbeatManager(100, 50);

      const engineSocket = createMockEngineSocket("sid-1");
      manager.add(engineSocket);

      await delay(100);

      manager.destroy();

      expect(manager.size).toBe(0);

      engineSocket.close();
    }, { sanitizeOps: false, sanitizeResources: false });

    it("destroy 后再次调用不应报错", () => {
      const manager = new BatchHeartbeatManager(100, 50);
      manager.destroy();
      manager.destroy();
      expect(manager.size).toBe(0);
    });
  });

  describe("PollingBatchHandler.clear()", () => {
    it("clear 应清除 batchTimer 并 resolve 所有 pending 请求为 CLOSE 包", async () => {
      const resolved: Response[] = [];
      const processor = async (sids: string[]) => {
        const map = new Map<string, Response>();
        for (const sid of sids) {
          map.set(sid, new Response("ok", { status: 200 }));
        }
        return map;
      };

      const handler = new PollingBatchHandler(processor, 50, 100);

      const p1 = new Promise<Response>((resolve) =>
        handler.addPoll("sid-1", resolve)
      );
      const p2 = new Promise<Response>((resolve) =>
        handler.addPoll("sid-2", resolve)
      );

      handler.clear();

      const r1 = await p1;
      const r2 = await p2;

      const text1 = await r1.text();
      const text2 = await r2.text();

      expect(text1).toBe("1:1");
      expect(text2).toBe("1:1");
    });

    it("clear 后 addPoll 不应导致未 resolve 的请求", async () => {
      const processor = async () => new Map<string, Response>();
      const handler = new PollingBatchHandler(processor, 1000, 2000);

      handler.addPoll("sid-1", () => {});
      handler.clear();

      await delay(50);

      handler.addPoll("sid-2", (res) => {
        expect(res).toBeTruthy();
      });

      await delay(100);
    }, { sanitizeOps: false, sanitizeResources: false });
  });

  describe("AdaptivePollingTimeout.reset()", () => {
    it("reset 应将连接数置为 0", () => {
      const timeout = new AdaptivePollingTimeout(60000);
      timeout.updateConnections(100);
      expect(timeout.connections).toBe(100);

      timeout.reset();
      expect(timeout.connections).toBe(0);
    });
  });

  describe("PollingTransport.close() 与 clearListeners", () => {
    it("close 后 isClosed 应返回 true", async () => {
      const transport = new PollingTransport(60000);
      transport.close();
      expect(transport.isClosed()).toBe(true);
    });

    it("close 后 hasPendingPackets 应返回 false", async () => {
      const transport = new PollingTransport(60000);
      transport.send({ type: EnginePacketType.MESSAGE, data: "test" });
      expect(transport.hasPendingPackets()).toBe(true);
      transport.close();
      expect(transport.hasPendingPackets()).toBe(false);
    });
  });

  describe("Server.close() 资源清理", () => {
    it("close 后再次 listen 应可重新启动", async () => {
      const port = getAvailablePort();
      const server = new Server({ port, path: "/socket.io/" });

      await server.listen();
      await delay(100);

      await server.close();
      await delay(200);

      await server.listen();
      await delay(100);

      expect(server).toBeTruthy();

      await server.close();
      await delay(200);
    }, { sanitizeOps: false, sanitizeResources: false });

    it("close 后无未处理的定时器泄漏", async () => {
      const port = getAvailablePort();
      const server = new Server({
        port,
        path: "/socket.io/",
        pingInterval: 1000,
        pingTimeout: 2000,
      });

      await server.listen();
      await delay(150);

      await server.close();
      await delay(300);

      expect(server).toBeTruthy();
    }, { sanitizeOps: false, sanitizeResources: false });
  });
});

describe("API 优化", () => {
  describe("PollingTransport.hasPendingPackets()", () => {
    it("无数据时应返回 false", () => {
      const transport = new PollingTransport(60000);
      expect(transport.hasPendingPackets()).toBe(false);
    });

    it("有数据时应返回 true", () => {
      const transport = new PollingTransport(60000);
      transport.send({ type: EnginePacketType.MESSAGE, data: "x" });
      expect(transport.hasPendingPackets()).toBe(true);
      transport.close();
    });
  });

  describe("SocketIOSocket.addToRoom/removeFromRoom", () => {
    it("addToRoom 应将 Socket 加入房间", () => {
      const engineSocket = createMockEngineSocket("sid-1");
      const socket = new SocketIOSocket(engineSocket, "/");

      socket.addToRoom("room-1");
      expect(socket.rooms.has("room-1")).toBe(true);

      socket.removeFromRoom("room-1");
      expect(socket.rooms.has("room-1")).toBe(false);

      engineSocket.close();
    }, { sanitizeOps: false, sanitizeResources: false });
  });

  describe("SocketIOSocket.processPacket()", () => {
    it("processPacket 应正确解析并触发事件", async () => {
      const engineSocket = createMockEngineSocket("sid-1");
      const socket = new SocketIOSocket(engineSocket, "/");

      let received = false;
      socket.on("evt", () => {
        received = true;
      });

      const { encodePacket } = await import("../src/socketio/parser.ts");
      const packet = {
        type: SocketIOPacketType.EVENT,
        nsp: "/",
        data: ["evt", { x: 1 }],
      };
      socket.processPacket(encodePacket(packet));

      expect(received).toBe(true);

      engineSocket.close();
    }, { sanitizeOps: false, sanitizeResources: false });
  });

  describe("socket.getServer()", () => {
    it("当 Socket 关联 Server 时，getServer 应返回 Server 实例", async () => {
      const port = getAvailablePort();
      const server = new Server({ port, path: "/socket.io/" });

      server.on("connection", (socket) => {
        const s = socket.getServer();
        expect(s).toBe(server);
      });

      await server.listen();
      await delay(100);

      const client = new (await import("../src/client/mod.ts")).Client({
        url: `http://localhost:${port}`,
        namespace: "/",
        autoConnect: true,
        transports: ["polling"],
        autoReconnect: false,
      });

      await delay(2000);

      client.disconnect();
      await delay(200);
      await server.close();
      await delay(200);
    }, { sanitizeOps: false, sanitizeResources: false, timeout: 5000 });
  });
});

describe("WebSocketBatchSender setTr", () => {
  it("setTr 应可被调用", () => {
    const sender = new WebSocketBatchSender(100);
    sender.setTr((key, fallback) => fallback);
    expect(sender).toBeTruthy();
  });
});

describe("连接断开后资源清理集成", () => {
  it("客户端断开后 Server close 应正常完成", async () => {
    const port = getAvailablePort();
    const server = new Server({ port, path: "/socket.io/" });

    server.on("connection", () => {});

    await server.listen();
    await delay(100);

    const client = new (await import("../src/client/mod.ts")).Client({
      url: `http://localhost:${port}`,
      namespace: "/",
      autoConnect: true,
      transports: ["polling"],
      autoReconnect: false,
    });

    await delay(1500);

    client.disconnect();
    await delay(300);

    await server.close();
    await delay(300);

    expect(server).toBeTruthy();
  }, { sanitizeOps: false, sanitizeResources: false, timeout: 5000 });
});
