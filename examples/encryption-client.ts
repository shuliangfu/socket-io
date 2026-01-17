/**
 * @fileoverview Socket.IO 加密客户端示例
 * 演示如何使用加密功能与服务器通信
 */

import { Client } from "../src/client/mod.ts";
import { EncryptionManager } from "../src/encryption/encryption-manager.ts";

// 使用与服务器相同的密钥（在实际应用中，应该通过安全方式共享密钥）
// 这里使用 Base64 编码的密钥字符串
const encryptionKeyBase64 = "your-base64-encoded-key-here"; // 从服务器获取
const encryptionKey = Uint8Array.from(
  atob(encryptionKeyBase64),
  (c) => c.charCodeAt(0),
);

// 或者从密码生成密钥
// const encryptionKey = EncryptionManager.generateKeyFromPassword("your-password", "aes-256");

// 创建启用加密的 Socket.IO 客户端
const client = new Client({
  url: "http://localhost:3000",
  namespace: "/",
  autoConnect: true,
  encryption: {
    key: encryptionKey,
    algorithm: "aes-256-gcm", // 必须与服务器使用相同的算法
    enabled: true,
  },
});

// 连接成功事件
client.on("connect", () => {
  console.log("已连接到加密服务器，Socket ID:", client.getId());

  // 发送加密消息
  client.emit("chat-message", {
    text: "这是一条加密消息",
    timestamp: Date.now(),
  });

  // 发送带确认的加密消息
  client.emit("secure-request", { action: "get-data" }, (response) => {
    console.log("收到服务器确认响应:", response);
  });
});

// 接收消息（自动解密）
client.on("chat-response", (data) => {
  console.log("收到服务器响应（已解密）:", data);
});

// 断开连接事件
client.on("disconnect", (reason) => {
  console.log("断开连接:", reason);
});

// 连接错误事件
client.on("connect_error", (error) => {
  console.error("连接错误:", error);
});
