/**
 * @fileoverview 安全调用 `@dreamer/logger`：`(...logger?.method ?? console.method)(…)`
 * 会把实例方法从对象上拆下来调用，导致运行时 `this` 丢失并抛出
 * `Cannot read properties of undefined (reading 'log')`。
 */

import type { Logger } from "@dreamer/logger";

/**
 * 记录错误：始终在 Logger 实例上调用 `error`，否则回退 `console.error`。
 *
 * @param logger 可选 Logger（可为 undefined）
 * @param message 主消息
 * @param data Logger#error 的第二参数（可选）
 * @param error Logger#error 的第三参数（可选）
 */
export function safeLoggerError(
  logger: Logger | undefined,
  message: string,
  data?: unknown,
  error?: unknown,
): void {
  if (logger) {
    logger.error(message, data, error);
    return;
  }
  if (error !== undefined) {
    console.error(message, data, error);
    return;
  }
  if (data !== undefined) {
    console.error(message, data);
    return;
  }
  console.error(message);
}

/**
 * 记录警告：始终在 Logger 实例上调用 `warn`，否则回退 `console.warn`。
 *
 * @param logger 可选 Logger（可为 undefined）
 * @param message 主消息
 * @param data Logger#warn 的第二参数（可选）
 * @param error Logger#warn 的第三参数（可选）
 */
export function safeLoggerWarn(
  logger: Logger | undefined,
  message: string,
  data?: unknown,
  error?: unknown,
): void {
  if (logger) {
    logger.warn(message, data, error);
    return;
  }
  if (error !== undefined) {
    console.warn(message, data, error);
    return;
  }
  if (data !== undefined) {
    console.warn(message, data);
    return;
  }
  console.warn(message);
}
