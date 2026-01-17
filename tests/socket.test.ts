/**
 * @fileoverview Socket.IO Socket 测试
 * 测试 Socket 的事件系统、消息发送、房间管理等
 */

import { describe, expect, it } from "@dreamer/test";
import { EngineSocket, SocketIOSocket } from "../src/mod.ts";
import {
  EnginePacketType,
  Handshake,
  SocketIOPacketType,
} from "../src/types.ts";
import { delay } from "./test-utils.ts";

describe("Socket.IO Socket", () => {
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
    engineSocket.setTransport(mockTransport as any);
    return engineSocket;
  }

  it("应该创建 Socket 实例", () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    expect(socket).toBeTruthy();
    expect(socket.id).toBe("test-id");
    expect(socket.nsp).toBe("/");
    expect(socket.connected).toBe(true);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该发送事件", () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let sentPacket: any = null;

    // 拦截传输层的 send 方法
    const originalSend = engineSocket.send.bind(engineSocket);
    engineSocket.send = (packet: any) => {
      sentPacket = packet;
      originalSend(packet);
    };

    socket.emit("test-event", { message: "hello" });

    expect(sentPacket).toBeTruthy();
    expect(sentPacket.type).toBe(EnginePacketType.MESSAGE);
    expect(typeof sentPacket.data).toBe("string");

    // 清理资源
    engineSocket.close();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该监听事件", async () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let eventReceived = false;
    let receivedData: any = null;

    socket.on("test-event", (data) => {
      eventReceived = true;
      receivedData = data;
    });

    // 模拟接收 Socket.IO 数据包
    // 使用 encodePacket 来正确编码数据包
    const { encodePacket } = await import("../src/socketio/parser.ts");
    const socketIOPacket = {
      type: SocketIOPacketType.EVENT,
      data: ["test-event", { message: "hello" }],
    };
    const encoded = encodePacket(socketIOPacket);
    (socket as any).handleSocketIOPacket(encoded);

    expect(eventReceived).toBe(true);
    expect(receivedData).toEqual({ message: "hello" });

    // 清理资源
    engineSocket.close();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该移除事件监听器", () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let callCount = 0;

    const listener = () => {
      callCount++;
    };

    socket.on("test-event", listener);
    socket.off("test-event", listener);

    // 模拟接收事件
    const packet = {
      type: EnginePacketType.MESSAGE,
      data: JSON.stringify({
        type: SocketIOPacketType.EVENT,
        data: ["test-event", {}],
      }),
    };
    (socket as any).handleSocketIOPacket(packet.data);

    expect(callCount).toBe(0);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持房间管理", () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");

    socket.join("room1");
    expect(socket.rooms.has("room1")).toBe(true);

    socket.leave("room1");
    expect(socket.rooms.has("room1")).toBe(false);

    // 清理资源
    engineSocket.close();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 once() 方法 - 只监听一次事件", async () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let callCount = 0;

    socket.once("test-event", () => {
      callCount++;
    });

    // 模拟接收两次事件
    const { encodePacket } = await import("../src/socketio/parser.ts");
    const socketIOPacket1 = {
      type: SocketIOPacketType.EVENT,
      data: ["test-event", {}],
    };
    const encoded1 = encodePacket(socketIOPacket1);
    (socket as any).handleSocketIOPacket(encoded1);

    const socketIOPacket2 = {
      type: SocketIOPacketType.EVENT,
      data: ["test-event", {}],
    };
    const encoded2 = encodePacket(socketIOPacket2);
    (socket as any).handleSocketIOPacket(encoded2);

    // 应该只被调用一次
    expect(callCount).toBe(1);

    // 清理资源
    engineSocket.close();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 removeAllListeners() 方法", async () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let callCount1 = 0;
    let callCount2 = 0;

    socket.on("test-event-1", () => {
      callCount1++;
    });
    socket.on("test-event-2", () => {
      callCount2++;
    });

    // 移除特定事件的所有监听器
    socket.removeAllListeners("test-event-1");

    // 模拟接收事件
    const { encodePacket } = await import("../src/socketio/parser.ts");
    const packet1 = {
      type: SocketIOPacketType.EVENT,
      data: ["test-event-1", {}],
    };
    const encoded1 = encodePacket(packet1);
    (socket as any).handleSocketIOPacket(encoded1);

    const packet2 = {
      type: SocketIOPacketType.EVENT,
      data: ["test-event-2", {}],
    };
    const encoded2 = encodePacket(packet2);
    (socket as any).handleSocketIOPacket(encoded2);

    expect(callCount1).toBe(0);
    expect(callCount2).toBe(1);

    // 移除所有事件的所有监听器
    socket.removeAllListeners();

    const packet3 = {
      type: SocketIOPacketType.EVENT,
      data: ["test-event-2", {}],
    };
    const encoded3 = encodePacket(packet3);
    (socket as any).handleSocketIOPacket(encoded3);

    expect(callCount2).toBe(1); // 不应该再增加

    // 清理资源
    engineSocket.close();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持事件确认", async () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let ackReceived = false;

    // 拦截发送以捕获确认
    const originalSend = engineSocket.send.bind(engineSocket);
    const { decodePacket: decodeSocketIOPacket } = await import(
      "../src/socketio/parser.ts"
    );
    engineSocket.send = (packet: any) => {
      if (packet.type === EnginePacketType.MESSAGE) {
        const data = packet.data as string;
        if (data.startsWith(String(SocketIOPacketType.ACK))) {
          ackReceived = true;
          // 解析确认数据
          try {
            const _decoded = decodeSocketIOPacket(data);
            // ackData = _decoded.data; // 已移除未使用的变量
          } catch {
            // 忽略解析错误
          }
        }
      }
      originalSend(packet);
    };

    socket.on("test-event", (_data, callback) => {
      if (callback) {
        callback({ status: "ok" });
      }
    });

    // 模拟接收带确认 ID 的事件
    const { encodePacket } = await import("../src/socketio/parser.ts");
    const socketIOPacket = {
      type: SocketIOPacketType.EVENT,
      id: 1,
      data: ["test-event", {}],
    };
    const encoded = encodePacket(socketIOPacket);
    (socket as any).handleSocketIOPacket(encoded);
    await delay(100);

    // 验证确认被发送
    expect(ackReceived).toBe(true);

    // 清理资源
    engineSocket.close();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该断开连接", () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let disconnectEventFired = false;

    socket.on("disconnect", () => {
      disconnectEventFired = true;
    });

    socket.disconnect("test reason");

    expect(socket.connected).toBe(false);
    expect(disconnectEventFired).toBe(true);

    // 清理资源（disconnect 已经关闭了 engineSocket）
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该处理断开连接数据包", async () => {
    const engineSocket = createMockEngineSocket("test-id");
    const socket = new SocketIOSocket(engineSocket, "/");
    let disconnectEventFired = false;

    socket.on("disconnect", () => {
      disconnectEventFired = true;
    });

    // 模拟接收断开连接数据包
    const { encodePacket } = await import("../src/socketio/parser.ts");
    const socketIOPacket = {
      type: SocketIOPacketType.DISCONNECT,
      data: "server disconnect",
    };
    const encoded = encodePacket(socketIOPacket);
    (socket as any).handleSocketIOPacket(encoded);

    expect(disconnectEventFired).toBe(true);
    expect(socket.connected).toBe(false);
    // 注意：DISCONNECT 数据包的 data 字段可能不会被正确传递
    // 这里主要测试断开连接事件被触发

    // 清理资源（disconnect 已经关闭了 engineSocket）
  }, { sanitizeOps: false, sanitizeResources: false });
});
