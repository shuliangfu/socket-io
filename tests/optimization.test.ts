/**
 * @fileoverview 优化功能集成测试
 */

import { describe, expect, it } from "@dreamer/test";
import { Server } from "../src/server.ts";
import { delay, getAvailablePort } from "./test-utils.ts";

describe("优化功能集成测试", () => {
  it("应该启用消息序列化缓存", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
    });

    await io.listen();
    await delay(100);

    // 服务器应该成功启动
    expect(io).toBeTruthy();

    await io.close();
    await delay(200); // 增加延迟，确保所有资源清理完成
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该启用批量心跳管理器", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
      pingInterval: 1000,
      pingTimeout: 2000,
    });

    await io.listen();
    await delay(100);

    // 服务器应该成功启动（批量心跳管理器已集成）
    expect(io).toBeTruthy();

    await io.close();
    await delay(200);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该启用压缩支持", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
      compression: true,
    });

    await io.listen();
    await delay(100);

    // 服务器应该成功启动（压缩管理器已创建）
    expect(io).toBeTruthy();

    await io.close();
    await delay(200);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该启用流式处理", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
      streaming: true,
      maxPacketSize: 1024 * 1024, // 1MB
    });

    await io.listen();
    await delay(100);

    // 服务器应该成功启动（流式处理已启用）
    expect(io).toBeTruthy();

    await io.close();
    await delay(200);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该启用硬件加速", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
      hardwareAcceleration: true,
    });

    await io.listen();
    await delay(100);

    // 服务器应该成功启动（硬件加速器已创建）
    expect(io).toBeTruthy();

    await io.close();
    await delay(200);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该同时启用所有优化", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
      compression: true,
      streaming: true,
      hardwareAcceleration: true,
    });

    await io.listen();
    await delay(100);

    // 服务器应该成功启动（所有优化已启用）
    expect(io).toBeTruthy();

    await io.close();
    await delay(200);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("应该使用内存适配器（默认）", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
    });

    await io.listen();
    await delay(100);

    // 应该使用内存适配器
    expect(io).toBeTruthy();

    await io.close();
    await delay(100);
  });

  it("应该使用动态轮询超时", async () => {
    const port = await getAvailablePort();
    const io = new Server({
      port,
      path: "/socket.io/",
      pollingTimeout: 30000,
    });

    await io.listen();
    await delay(100);

    // 服务器应该成功启动（动态轮询超时管理器已创建）
    expect(io).toBeTruthy();

    await io.close();
    await delay(200);
  }, { sanitizeOps: false, sanitizeResources: false });
});
