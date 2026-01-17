/**
 * @fileoverview Redis 适配器示例
 * 演示如何使用 Redis 适配器实现分布式 Socket.IO 服务器
 */

import { Server } from "../src/mod.ts";
import { RedisAdapter } from "../src/adapters/mod.ts";

// 创建使用 Redis 适配器的 Socket.IO 服务器
const io = new Server({
  port: 3000,
  path: "/socket.io/",
  adapter: new RedisAdapter({
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
    // 可选：使用不同的 Redis 连接用于 Pub/Sub
    // pubsubConnection: {
    //   host: "127.0.0.1",
    //   port: 6379,
    // },
    keyPrefix: "socket.io",
    heartbeatInterval: 30,
  }),
});

// 监听连接事件
io.on("connection", (socket) => {
  console.log(`客户端连接: ${socket.id}`);

  // 监听聊天消息
  socket.on("chat-message", (data: any) => {
    console.log(`收到消息: ${data.message} from ${socket.id}`);

    // 广播到房间（会通过 Redis 同步到其他服务器）
    socket.to("chat-room").emit("chat-message", {
      message: data.message,
      from: socket.id,
    });
  });

  // 加入聊天房间
  socket.on("join-room", (room: string) => {
    socket.join(room);
    console.log(`Socket ${socket.id} 加入房间: ${room}`);
  });

  // 断开连接
  socket.on("disconnect", () => {
    console.log(`客户端断开: ${socket.id}`);
  });
});

// 启动服务器
await io.listen();
console.log("Socket.IO 服务器已启动（使用 Redis 适配器）");
