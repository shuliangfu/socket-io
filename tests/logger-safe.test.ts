/**
 * @fileoverview 校验 {@link safeLoggerError} / {@link safeLoggerWarn} 在 Logger 依赖实例 `this` 时仍可调用。
 */

import type { Logger } from "@dreamer/logger";
import { describe, expect, it } from "@dreamer/test";
import { safeLoggerError, safeLoggerWarn } from "../src/logger-safe.ts";

/** 最小 Logger 替身：`error`/`warn` 依赖实例字段以暴露错误绑定。 */
class ThisBoundLogger implements
  Pick<
    Logger,
    "debug" | "info" | "warn" | "error" | "fatal" | "child"
  > {
  errorCalled = false;
  warnCalled = false;

  debug(): void {}
  info(): void {}

  warn(message: string): void {
    this.warnCalled = true;
    expect(message).toBe("w");
  }

  error(message: string): void {
    this.errorCalled = true;
    expect(message).toBe("e");
  }

  fatal(): void {}

  child(): Logger {
    return this as unknown as Logger;
  }
}

describe("logger-safe", () => {
  it("safeLoggerError 应在 Logger 实例上调用 error（保留 this）", () => {
    const log = new ThisBoundLogger();
    safeLoggerError(log as unknown as Logger, "e", new Error("x"));
    expect(log.errorCalled).toBe(true);
  });

  it("safeLoggerWarn 应在 Logger 实例上调用 warn（保留 this）", () => {
    const log = new ThisBoundLogger();
    safeLoggerWarn(log as unknown as Logger, "w");
    expect(log.warnCalled).toBe(true);
  });
});
