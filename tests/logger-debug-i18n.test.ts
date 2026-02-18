/**
 * @fileoverview Socket.IO logger、debug、i18n 翻译功能测试
 * 测试 Server 的 logger 注入、debug 开关、tr 翻译函数（包内 i18n）
 */

import { describe, expect, it } from "@dreamer/test";
import type { Logger } from "@dreamer/logger";
import { $t } from "../src/i18n.ts";
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

describe("Socket.IO logger、debug、i18n 翻译", () => {
  describe("logger 注入", () => {
    it("未传入 logger 时应使用默认 logger 创建实例", () => {
      const server = new Server();
      expect(server).toBeTruthy();
      expect(server.options.path).toBe("/socket.io/");
    });

    it(
      "传入自定义 logger 时应在 listen 时使用该 logger 输出 info",
      async () => {
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
        expect(mockLogger.infoCalls.some((m) => m.includes("Socket.IO"))).toBe(
          true,
        );
        // 中文 "运行" 或英文 "running"（随 locale 变化）
        expect(
          mockLogger.infoCalls.some((m) =>
            m.includes("运行") || m.includes("running")
          ),
        ).toBe(true);

        await server.close();
        await delay(100);
      },
      { sanitizeOps: false, sanitizeResources: false },
    );
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
      expect(mockLogger.debugCalls.some((m) => m.includes("[Socket.IO]"))).toBe(
        true,
      );

      await server.close();
      await delay(100);
    }, { sanitizeOps: false, sanitizeResources: false });
  });

  describe("$t 翻译函数", () => {
    it("已知 key 时 $t() 应返回包内 i18n 翻译（zh 或 en）", () => {
      const result = $t("log.socketio.pathMismatch", { path: "/other" });
      const expected = [
        "路径不匹配 pathPrefix，返回 404",
        "Path does not match pathPrefix, returning 404",
      ];
      expect(expected).toContain(result);
    });

    it("未知 key 时 $t() 返回 key 或库默认行为", () => {
      const result = $t("unknown.key.xyz", {});
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("$t() 支持 params 参数替换", () => {
      const result = $t("log.socketio.requestReceived", {
        method: "GET",
        path: "/socket.io/",
        search: "",
      });
      expect(result).toContain("GET");
      expect(result).toContain("/socket.io/");
    });
  });

  describe("logger + debug 组合", () => {
    it("debug=true 时，debug 日志应使用包内 i18n 翻译后的文本", async () => {
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

      // 请求非 path 路径，触发 pathMismatch 的 debugLog
      await fetch(`http://localhost:${testPort}/other`);
      await delay(100);

      expect(mockLogger.debugCalls.length).toBeGreaterThanOrEqual(1);
      // 应包含 [Socket.IO] 及 pathMismatch 的翻译（中或英）
      const hasPathMismatch = mockLogger.debugCalls.some((m) =>
        m.includes("[Socket.IO]") &&
        (m.includes("路径不匹配") || m.includes("Path does not match"))
      );
      expect(hasPathMismatch).toBe(true);

      await server.close();
      await delay(100);
    }, { sanitizeOps: false, sanitizeResources: false });
  });
});
