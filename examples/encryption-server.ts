/**
 * @fileoverview Socket.IO 加密服务器示例
 * 演示如何使用加密功能保护消息传输
 */

import { Server } from "../src/mod.ts";
import { EncryptionManager } from "../src/encryption/encryption-manager.ts";

// 生成加密密钥（在实际应用中，应该使用安全的密钥管理方式）
const encryptionKey = EncryptionManager.generateKey("aes-256");

// 创建启用加密的 Socket.IO 服务器
const io = new Server({
  port: 3000,
  path: "/socket.io/",
  encryption: {
    key: encryptionKey,
    algorithm: "aes-256-gcm", // 使用 AES-256-GCM 算法
    enabled: true,
  },
});

// 连接建立事件
io.on("connection", (socket) => {
  console.log("新连接建立（加密）:", socket.id);

  // 监听自定义事件（消息会自动解密）
  socket.on("chat-message", (data: any) => {
    console.log("收到加密消息:", data);

    // 发送响应（消息会自动加密）
    socket.emit("chat-response", {
      status: "success",
      message: "消息已收到并解密",
      received: data,
    });
  });

  // 监听带确认的事件
  socket.on(
    "secure-request",
    (data: any, callback?: (response: any) => void) => {
      console.log("收到安全请求:", data);

      // 发送确认响应
      if (callback) {
        callback({
          status: "ok",
          data: "响应数据",
        });
      }
    },
  );

  // 断开连接事件
  socket.on("disconnect", (reason: any) => {
    console.log("连接断开:", socket.id, reason);
  });
});

// 启动服务器
await io.listen();
console.log("Socket.IO 加密服务器运行在 http://localhost:3000");
console.log("加密密钥（Base64）:", btoa(String.fromCharCode(...encryptionKey)));
