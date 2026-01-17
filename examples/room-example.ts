/**
 * @fileoverview Socket.IO 房间功能示例
 * 演示如何使用房间功能实现群组通信
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

  // 监听加入房间事件
  socket.on("join-room", (roomId: string) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} 加入房间: ${roomId}`);

    // 通知房间内其他用户
    socket.to(roomId).emit("user-joined", {
      userId: socket.id,
      roomId,
      timestamp: Date.now(),
    });

    // 确认加入成功
    socket.emit("joined-room", {
      roomId,
      message: "已成功加入房间",
    });
  });

  // 监听离开房间事件
  socket.on("leave-room", (roomId: string) => {
    socket.leave(roomId);
    console.log(`Socket ${socket.id} 离开房间: ${roomId}`);

    // 通知房间内其他用户
    socket.to(roomId).emit("user-left", {
      userId: socket.id,
      roomId,
      timestamp: Date.now(),
    });
  });

  // 监听房间消息
  socket.on("room-message", (data: { roomId: string; message: string }) => {
    console.log(`房间 ${data.roomId} 收到消息:`, data.message);

    // 向房间内所有用户（包括发送者）广播消息
    io.of("/").to(data.roomId).emit("room-message", {
      userId: socket.id,
      message: data.message,
      timestamp: Date.now(),
    });
  });

  // 监听私聊消息（只发送给特定用户）
  socket.on("private-message", (data: { to: string; message: string }) => {
    console.log(`私聊消息: ${socket.id} -> ${data.to}`);

    // 只发送给目标用户
    io.of("/").to(data.to).emit("private-message", {
      from: socket.id,
      message: data.message,
      timestamp: Date.now(),
    });
  });

  // 断开连接时，自动离开所有房间
  socket.on("disconnect", (reason: any) => {
    console.log("连接断开:", socket.id, reason);
  });
});

// 启动服务器
await io.listen();
console.log("Socket.IO 房间示例服务器运行在 http://localhost:3000");
