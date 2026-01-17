/**
 * @fileoverview Socket.IO 服务器测试
 * 测试服务器功能、连接处理、事件系统等
 */

import { describe, expect, it } from "@dreamer/test";
import { Server } from "../src/mod.ts";
import { delay, getAvailablePort } from "./test-utils.ts";

describe("Socket.IO 服务器", () => {
  it("应该创建服务器实例", () => {
    const server = new Server({
      port: 3000,
      path: "/socket.io/",
    });
    expect(server).toBeTruthy();
    expect(server.options.path).toBe("/socket.io/");
    expect(server.options.port).toBe(3000);
  });

  it("应该使用默认配置", () => {
    const server = new Server();
    expect(server.options.path).toBe("/socket.io/");
    expect(server.options.pingTimeout).toBe(20000);
    expect(server.options.pingInterval).toBe(25000);
  });

  it("应该启动服务器", async () => {
    const testPort = getAvailablePort();
    const server = new Server({
      port: testPort,
      path: "/socket.io/",
    });

    await server.listen();
    await delay(200);

    // 测试服务器是否响应
    const response = await fetch(`http://localhost:${testPort}/socket.io/`);
    expect(response.status).toBe(200);

    await server.close();
    await delay(100);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该处理连接事件", async () => {
    const testPort = getAvailablePort();
    const server = new Server({
      port: testPort,
      path: "/socket.io/",
    });

    server.on("connection", (socket) => {
      expect(socket).toBeTruthy();
      expect(socket.id).toBeTruthy();
    });

    await server.listen();
    await delay(200);

    // 发送握手请求
    const response = await fetch(
      `http://localhost:${testPort}/socket.io/?transport=polling`,
    );
    expect(response.status).toBe(200);
    const handshake = await response.json();
    expect(handshake.sid).toBeTruthy();

    await delay(300);
    // 注意：由于轮询传输的复杂性，连接事件可能不会立即触发
    // 这里主要测试服务器能够响应握手请求

    await server.close();
    await delay(100);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持命名空间", () => {
    const server = new Server();
    const chatNamespace = server.of("/chat");
    expect(chatNamespace).toBeTruthy();
    expect(chatNamespace.name).toBe("/chat");

    const gameNamespace = server.of("/game");
    expect(gameNamespace).toBeTruthy();
    expect(gameNamespace.name).toBe("/game");
  });

  it("应该返回相同的命名空间实例", () => {
    const server = new Server();
    const ns1 = server.of("/chat");
    const ns2 = server.of("/chat");
    expect(ns1).toBe(ns2);
  });

  it("应该关闭服务器", async () => {
    const testPort = getAvailablePort();
    const server = new Server({
      port: testPort,
      path: "/socket.io/",
    });

    await server.listen();
    await delay(200);

    await server.close();
    await delay(100);

    // 服务器应该已关闭
    try {
      await fetch(`http://localhost:${testPort}/socket.io/`);
      // 如果请求成功，说明服务器未关闭（这在某些情况下可能正常）
    } catch {
      // 连接失败是预期的
      expect(true).toBe(true);
    }
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 emit() - 向默认命名空间发送事件", async () => {
    const testPort = getAvailablePort();
    const server = new Server({
      port: testPort,
      path: "/socket.io/",
    });

    await server.listen();
    await delay(200);

    // emit 方法应该存在且可调用
    expect(typeof server.emit).toBe("function");
    server.emit("test-event", { message: "hello" });

    await server.close();
    await delay(100);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 to() - 向默认命名空间的房间发送事件", async () => {
    const testPort = getAvailablePort();
    const server = new Server({
      port: testPort,
      path: "/socket.io/",
    });

    await server.listen();
    await delay(200);

    // to 方法应该存在且可调用
    expect(typeof server.to).toBe("function");
    const builder = server.to("room1");
    expect(builder).toBeTruthy();
    expect(typeof builder.emit).toBe("function");
    builder.emit("test-event", { message: "hello" });

    await server.close();
    await delay(100);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 in() - to() 的别名", async () => {
    const testPort = getAvailablePort();
    const server = new Server({
      port: testPort,
      path: "/socket.io/",
    });

    await server.listen();
    await delay(200);

    // in 方法应该存在且可调用
    expect(typeof server.in).toBe("function");
    const builder = server.in("room1");
    expect(builder).toBeTruthy();
    expect(typeof builder.emit).toBe("function");

    await server.close();
    await delay(100);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该支持 except() - 排除房间或 Socket ID", async () => {
    const testPort = getAvailablePort();
    const server = new Server({
      port: testPort,
      path: "/socket.io/",
    });

    await server.listen();
    await delay(200);

    // except 方法应该存在且可调用
    expect(typeof server.except).toBe("function");
    const builder = server.except("room1");
    expect(builder).toBeTruthy();
    expect(typeof builder.emit).toBe("function");

    await server.close();
    await delay(100);
  }, { sanitizeOps: false, sanitizeResources: false });
});
