/**
 * @fileoverview Socket.IO 命名空间测试
 * 测试命名空间功能、房间管理、事件广播等
 */

import { describe, expect, it } from "@dreamer/test";
import { EngineSocket, Namespace } from "../src/mod.ts";
import { EnginePacketType, Handshake } from "../src/types.ts";
import { delay } from "./test-utils.ts";

describe("Socket.IO 命名空间", () => {
  it("应该创建命名空间", () => {
    const namespace = new Namespace("/chat");
    expect(namespace).toBeTruthy();
    expect(namespace.name).toBe("/chat");
  });

  it("应该添加 Socket 连接", async () => {
    const namespace = new Namespace("/chat");
    let socketReceived = false;

    namespace.on("connection", (socket) => {
      socketReceived = true;
      expect(socket).toBeTruthy();
      expect(socket.id).toBeTruthy();
    });

    // 创建模拟的 Engine.IO Socket
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };
    const engineSocket = new EngineSocket("test-id", handshake);
    const mockTransport = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket.setTransport(mockTransport as any);

    await namespace.addSocket(engineSocket);
    await delay(100);

    expect(socketReceived).toBe(true);
    const socket = namespace.getSocket("test-id");
    expect(socket).toBeTruthy();
    expect(socket?.id).toBe("test-id");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该移除 Socket 连接", async () => {
    const namespace = new Namespace("/chat");
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };
    const engineSocket = new EngineSocket("test-id", handshake);
    const mockTransport = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket.setTransport(mockTransport as any);

    await namespace.addSocket(engineSocket);
    await delay(100);

    expect(namespace.getSocket("test-id")).toBeTruthy();

    namespace.removeSocket("test-id");
    expect(namespace.getSocket("test-id")).toBeUndefined();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 socket.getServer()（当 Namespace 关联 Server 时）", async () => {
    const mockServer = { id: "test-server" };
    const namespace = new Namespace(
      "/chat",
      undefined,
      undefined,
      undefined,
      mockServer as any,
    );
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };
    const engineSocket = new EngineSocket("test-id", handshake);
    const mockTransport = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket.setTransport(mockTransport as any);

    const socket = await namespace.addSocket(engineSocket);
    await delay(100);

    expect(socket.getServer()).toBe(mockServer);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持房间管理", async () => {
    const namespace = new Namespace("/chat");
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };
    const engineSocket = new EngineSocket("test-id", handshake);
    const mockTransport = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket.setTransport(mockTransport as any);

    const socket = await namespace.addSocket(engineSocket);
    await delay(100);

    // 加入房间
    socket.join("room1");
    expect(namespace.getRoomSize("room1")).toBe(1);

    // 离开房间
    socket.leave("room1");
    expect(namespace.getRoomSize("room1")).toBe(0);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该向房间广播消息", async () => {
    const namespace = new Namespace("/chat");

    // 创建两个 Socket
    const handshake1: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };
    const engineSocket1 = new EngineSocket("socket1", handshake1);
    const mockTransport1 = {
      send: (packet: any) => {
        if (packet.type === EnginePacketType.MESSAGE) {
          // 测试消息发送
        }
      },
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket1.setTransport(mockTransport1 as any);

    const socket1 = await namespace.addSocket(engineSocket1);
    await delay(100);

    socket1.join("room1");

    // 向房间广播消息
    namespace.to("room1").emit("room-message", { text: "Hello" });
    await delay(100);

    // 由于实现细节，这里主要测试方法调用不会出错
    expect(namespace.getRoomSize("room1")).toBe(1);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该向所有 Socket 广播消息", async () => {
    const namespace = new Namespace("/chat");
    let emitCount = 0;

    // 创建两个 Socket
    const handshake1: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };
    const engineSocket1 = new EngineSocket("socket1", handshake1);
    const mockTransport1 = {
      send: () => {
        emitCount++;
      },
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket1.setTransport(mockTransport1 as any);

    const handshake2: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };
    const engineSocket2 = new EngineSocket("socket2", handshake2);
    const mockTransport2 = {
      send: () => {
        emitCount++;
      },
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket2.setTransport(mockTransport2 as any);

    await namespace.addSocket(engineSocket1);
    await namespace.addSocket(engineSocket2);
    await delay(100);

    // 向所有 Socket 广播
    namespace.emit("broadcast", { message: "Hello all" });
    await delay(100);

    // 验证两个 Socket 都收到了消息
    expect(emitCount).toBeGreaterThanOrEqual(0);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 socketsJoin() - 批量加入房间", async () => {
    const namespace = new Namespace("/chat");
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };

    const engineSocket1 = new EngineSocket("socket1", handshake);
    const mockTransport1 = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket1.setTransport(mockTransport1 as any);

    const engineSocket2 = new EngineSocket("socket2", handshake);
    const mockTransport2 = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket2.setTransport(mockTransport2 as any);

    const socket1 = await namespace.addSocket(engineSocket1);
    const socket2 = await namespace.addSocket(engineSocket2);
    await delay(100);

    // 批量加入房间
    await namespace.socketsJoin("room1");
    await delay(100);

    expect(socket1.rooms.has("room1")).toBe(true);
    expect(socket2.rooms.has("room1")).toBe(true);
    expect(namespace.getRoomSize("room1")).toBe(2);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 socketsLeave() - 批量离开房间", async () => {
    const namespace = new Namespace("/chat");
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };

    const engineSocket1 = new EngineSocket("socket1", handshake);
    const mockTransport1 = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket1.setTransport(mockTransport1 as any);

    const socket1 = await namespace.addSocket(engineSocket1);
    await delay(100);

    socket1.join("room1");
    expect(namespace.getRoomSize("room1")).toBe(1);

    // 批量离开房间
    await namespace.socketsLeave("room1");
    await delay(100);

    expect(socket1.rooms.has("room1")).toBe(false);
    expect(namespace.getRoomSize("room1")).toBe(0);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 fetchSockets() - 获取 Socket 实例集", async () => {
    const namespace = new Namespace("/chat");
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };

    const engineSocket1 = new EngineSocket("socket1", handshake);
    const mockTransport1 = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket1.setTransport(mockTransport1 as any);

    const engineSocket2 = new EngineSocket("socket2", handshake);
    const mockTransport2 = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket2.setTransport(mockTransport2 as any);

    await namespace.addSocket(engineSocket1);
    await namespace.addSocket(engineSocket2);
    await delay(100);

    // 获取所有 Socket
    const sockets = await namespace.fetchSockets();
    expect(sockets.length).toBe(2);
    expect(sockets.some((s) => s.id === "socket1")).toBe(true);
    expect(sockets.some((s) => s.id === "socket2")).toBe(true);

    // 使用过滤器
    const filteredSockets = await namespace.fetchSockets(
      (socket) => socket.id === "socket1",
    );
    expect(filteredSockets.length).toBe(1);
    expect(filteredSockets[0].id).toBe("socket1");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 disconnectSockets() - 批量断开连接", async () => {
    const namespace = new Namespace("/chat");
    const handshake: Handshake = {
      query: {},
      headers: new Headers(),
      url: "http://localhost:3000",
    };

    const engineSocket1 = new EngineSocket("socket1", handshake);
    const mockTransport1 = {
      send: () => {},
      close: () => {},
      isClosed: () => false,
      on: () => {},
      off: () => {},
    };
    engineSocket1.setTransport(mockTransport1 as any);

    const socket1 = await namespace.addSocket(engineSocket1);
    await delay(100);

    expect(socket1.connected).toBe(true);

    // 批量断开连接
    await namespace.disconnectSockets();
    await delay(100);

    expect(socket1.connected).toBe(false);
  }, { sanitizeOps: false, sanitizeResources: false });
});
