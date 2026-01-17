/**
 * @fileoverview Socket.IO 命名空间示例
 * 演示如何使用命名空间隔离不同业务场景
 */

import { Server } from "../src/mod.ts";

// 创建 Socket.IO 服务器
const io = new Server({
  port: 3000,
  path: "/socket.io/",
});

// 默认命名空间 "/"
io.on("connection", (socket) => {
  console.log("默认命名空间连接:", socket.id);

  socket.on("message", (data: any) => {
    console.log("默认命名空间收到消息:", data);
    socket.emit("response", { namespace: "/", data });
  });
});

// 聊天命名空间 "/chat"
const chatNamespace = io.of("/chat");
chatNamespace.on("connection", (socket) => {
  console.log("聊天命名空间连接:", socket.id);

  socket.on("chat-message", (data: any) => {
    console.log("聊天消息:", data);
    // 广播给聊天命名空间的所有用户
    chatNamespace.emit("chat-message", {
      userId: socket.id,
      message: data.message,
      timestamp: Date.now(),
    });
  });
});

// 游戏命名空间 "/game"
const gameNamespace = io.of("/game");
gameNamespace.on("connection", (socket) => {
  console.log("游戏命名空间连接:", socket.id);

  socket.on("game-action", (data: any) => {
    console.log("游戏操作:", data);
    // 只发送给游戏命名空间的用户
    gameNamespace.emit("game-update", {
      playerId: socket.id,
      action: data.action,
      timestamp: Date.now(),
    });
  });
});

// 通知命名空间 "/notifications"
const notificationNamespace = io.of("/notifications");
notificationNamespace.on("connection", (socket) => {
  console.log("通知命名空间连接:", socket.id);

  // 定期发送通知
  const interval = setInterval(() => {
    socket.emit("notification", {
      type: "info",
      message: "这是一条通知",
      timestamp: Date.now(),
    });
  }, 5000);

  socket.on("disconnect", () => {
    clearInterval(interval);
  });
});

// 启动服务器
await io.listen();
console.log("Socket.IO 命名空间示例服务器运行在 http://localhost:3000");
console.log("可用命名空间:");
console.log("  - / (默认)");
console.log("  - /chat (聊天)");
console.log("  - /game (游戏)");
console.log("  - /notifications (通知)");
