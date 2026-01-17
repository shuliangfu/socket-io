/**
 * @fileoverview Socket.IO 基础客户端示例
 * 演示如何使用 Socket.IO 客户端
 */

import { Client } from "../src/client/mod.ts";

// 创建 Socket.IO 客户端
const client = new Client({
  url: "http://localhost:3000",
  namespace: "/",
  autoConnect: true,
  autoReconnect: true,
});

// 连接成功事件
client.on("connect", () => {
  console.log("已连接到服务器，Socket ID:", client.getId());

  // 发送消息
  client.emit("chat-message", {
    text: "Hello, Server!",
  });
});

// 接收消息
client.on("chat-response", (data) => {
  console.log("收到服务器响应:", data);
});

// 断开连接事件
client.on("disconnect", (reason) => {
  console.log("断开连接:", reason);
});

// 连接错误事件
client.on("connect_error", (error) => {
  console.error("连接错误:", error);
});

// 重连失败事件
client.on("reconnect_failed", () => {
  console.error("重连失败");
});
