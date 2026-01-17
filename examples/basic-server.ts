/**
 * @fileoverview Socket.IO 基础服务器示例
 * 演示如何使用 Socket.IO 服务器
 */

import { Server } from "../src/mod.ts";

// 创建 Socket.IO 服务器
const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

// 连接建立事件
io.on("connection", (socket) => {
  console.log("新连接建立:", socket.id);

  // 监听自定义事件
  socket.on("chat-message", (data: any) => {
    console.log("收到聊天消息:", data);

    // 发送事件
    socket.emit("chat-response", {
      status: "success",
      message: "消息已收到",
    });
  });

  // 断开连接事件
  socket.on("disconnect", (reason: any) => {
    console.log("连接断开:", socket.id, reason);
  });
});

// 启动服务器
await io.listen();
console.log("Socket.IO 服务器运行在 http://localhost:3000");
