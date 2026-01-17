/**
 * @fileoverview 测试工具函数
 * 提供测试中常用的工具函数
 */

/**
 * 延迟函数
 * @param ms 延迟毫秒数
 * @returns Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 获取可用端口
 * @returns 可用端口号
 */
export function getAvailablePort(): number {
  // 使用随机端口，避免冲突
  return 30000 + Math.floor(Math.random() * 10000);
}

/**
 * 创建 WebSocket 客户端（用于测试）
 * @param url WebSocket URL
 * @returns Promise<WebSocket>
 */
export function createWebSocketClient(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (error) => reject(error);
  });
}

/**
 * 等待 WebSocket 连接关闭
 * @param ws WebSocket 连接
 * @returns Promise<void>
 */
export function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.onclose = () => resolve();
  });
}

/**
 * 等待指定时间后关闭 WebSocket
 * @param ws WebSocket 连接
 * @param ms 等待毫秒数
 * @returns Promise<void>
 */
export function closeAfterDelay(ws: WebSocket, ms: number): Promise<void> {
  return delay(ms).then(() => {
    if (
      ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
  });
}
