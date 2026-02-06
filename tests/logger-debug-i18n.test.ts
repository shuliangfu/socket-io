/**
 * @fileoverview Socket.IO logger、debug、t 翻译功能测试
 * 测试 Server 的 logger 注入、debug 开关、tr 翻译函数
 */

import { describe, expect, it } from "@dreamer/test";
import type { Logger } from "@dreamer/logger";
import { Server } from "../src/mod.ts";
import { delay, getAvailablePort } from "./test-utils.ts";

/** Mock Logger 扩展：记录 info/debug 调用 */
interface MockLogger extends Logger {
  infoCalls: string[];
  debugCalls: string[];
}

/**
 * 创建 mock Logger，记录 info/debug 调用
 * Server 仅使用 logger.info 与 logger.debug，故 mock 仅实现必要方法
 */
function createMockLogger(): MockLogger {
  const infoCalls: string[] = [];
  const debugCalls: string[] = [];
  const mock = {
    info: (message: string) => {
      infoCalls.push(message);
    },
    debug: (message: string) => {
      debugCalls.push(message);
    },
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => mock as unknown as Logger,
    infoCalls,
    debugCalls,
  };
  return mock as unknown as MockLogger;
}

describe("Socket.IO logger、debug、t 翻译", () => {
  describe("logger 注入", () => {
    it("未传入 logger 时应使用默认 logger 创建实例", () => {
      const server = new Server();
      expect(server).toBeTruthy();
      expect(server.options.path).toBe("/socket.io/");
    });

    it("传入自定义 logger 时应在 listen 时使用该 logger 输出 info", async () => {
      const mockLogger = createMockLogger();
      const testPort = getAvailablePort();
      const server = new Server({
        port: testPort,
        path: "/socket.io/",
        logger: mockLogger,
      });

      await server.listen();
      await delay(200);

      expect(mockLogger.infoCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockLogger.infoCalls.some((m) => m.includes("Socket.IO"))).toBe(true);
      expect(mockLogger.infoCalls.some((m) => m.includes("运行"))).toBe(true);

      await server.close();
      await delay(100);
    }, { sanitizeOps: false, sanitizeResources: false });
  });

  describe("debug 开关", () => {
    it("debug=false 时不应输出 debug 日志", async () => {
      const mockLogger = createMockLogger();
      const testPort = getAvailablePort();
      const server = new Server({
        port: testPort,
        path: "/socket.io/",
        logger: mockLogger,
        debug: false,
      });

      await server.listen();
      await delay(100);

      // 发送一个请求以触发 handleRequest 中的 debugLog
      await fetch(`http://localhost:${testPort}/socket.io/?transport=polling`);
      await delay(100);

      expect(mockLogger.debugCalls.length).toBe(0);

      await server.close();
      await delay(100);
    }, { sanitizeOps: false, sanitizeResources: false });

    it("debug=true 时应输出 debug 日志", async () => {
      const mockLogger = createMockLogger();
      const testPort = getAvailablePort();
      const server = new Server({
        port: testPort,
        path: "/socket.io/",
        logger: mockLogger,
        debug: true,
      });

      await server.listen();
      await delay(100);

      // 发送请求触发 debugLog
      await fetch(`http://localhost:${testPort}/socket.io/?transport=polling`);
      await delay(200);

      expect(mockLogger.debugCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockLogger.debugCalls.some((m) => m.includes("[Socket.IO]"))).toBe(true);

      await server.close();
      await delay(100);
    }, { sanitizeOps: false, sanitizeResources: false });
  });

  describe("tr 翻译函数", () => {
    it("未传入 t 时 tr() 应返回 fallback", () => {
      const server = new Server();
      const result = server.tr("log.socketio.pathMismatch", "路径不匹配 pathPrefix，返回 404", {
        path: "/other",
      });
      expect(result).toBe("路径不匹配 pathPrefix，返回 404");
    });

    it("传入 t 且返回有效翻译时 tr() 应返回翻译结果", () => {
      const server = new Server({
        t: (key, params) => `[EN] ${key} path=${params?.path ?? ""}`,
      });
      const result = server.tr("log.socketio.pathMismatch", "fallback", { path: "/x" });
      expect(result).toBe("[EN] log.socketio.pathMismatch path=/x");
    });

    it("t 返回 undefined 时 tr() 应返回 fallback", () => {
      const server = new Server({
        t: () => undefined,
      });
      const result = server.tr("log.socketio.pathMismatch", "fallback", { path: "/x" });
      expect(result).toBe("fallback");
    });

    it("t 返回 key 本身时 tr() 应返回 fallback（视为未翻译）", () => {
      const server = new Server({
        t: (key) => key,
      });
      const result = server.tr("log.socketio.pathMismatch", "fallback", { path: "/x" });
      expect(result).toBe("fallback");
    });

    it("t 支持 params 参数替换", () => {
      const server = new Server({
        t: (key, params) =>
          params ? `method=${params.method} path=${params.path}` : key,
      });
      const result = server.tr("log.socketio.requestReceived", "fallback", {
        method: "GET",
        path: "/socket.io/",
        search: "",
      });
      expect(result).toContain("method=GET");
      expect(result).toContain("path=/socket.io/");
    });
  });

  describe("logger + debug + t 组合", () => {
    it("debug=true 且传入 t 时，debug 日志应使用翻译后的文本", async () => {
      const mockLogger = createMockLogger();
      const testPort = getAvailablePort();
      const server = new Server({
        port: testPort,
        path: "/socket.io/",
        logger: mockLogger,
        debug: true,
        t: (key) => `[i18n]${key}`,
      });

      await server.listen();
      await delay(100);

      // 请求非 path 路径，触发 pathMismatch 的 debugLog
      await fetch(`http://localhost:${testPort}/other`);
      await delay(100);

      const pathMismatchLog = mockLogger.debugCalls.find((m) =>
        m.includes("log.socketio.pathMismatch") || m.includes("[i18n]log.socketio")
      );
      expect(mockLogger.debugCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockLogger.debugCalls.some((m) => m.includes("[i18n]"))).toBe(true);

      await server.close();
      await delay(100);
    }, { sanitizeOps: false, sanitizeResources: false });
  });
});
