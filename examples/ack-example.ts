/**
 * @fileoverview Socket.IO 事件确认示例
 * 演示如何使用事件确认机制实现请求-响应模式
 */

import { Server } from "../src/mod.ts";
import { Client } from "../src/client/mod.ts";

// 创建 Socket.IO 服务器
const server = new Server({
  port: 3000,
  path: "/socket.io/",
});

server.on("connection", (socket) => {
  console.log("新连接建立:", socket.id);

  // 处理带确认的事件
  socket.on<string>("get-user-info", (userId, callback?) => {
    console.log("收到获取用户信息请求:", userId);

    // 模拟异步操作
    setTimeout(() => {
      const userInfo = {
        id: userId,
        name: `用户 ${userId}`,
        email: `user${userId}@example.com`,
        timestamp: Date.now(),
      };

      // 发送确认响应
      if (callback) {
        callback(userInfo);
      }
    }, 100);
  });

  // 处理带确认的数据库查询
  socket.on<string>("query-database", (query, callback?) => {
    console.log("收到数据库查询:", query);

    // 模拟数据库查询
    const results = [
      { id: 1, name: "结果1" },
      { id: 2, name: "结果2" },
    ];

    // 发送确认响应
    if (callback) {
      callback({
        success: true,
        results,
        count: results.length,
      });
    }
  });

  // 处理带确认的计算任务
  socket.on<{ a: number; b: number; operation: string }>(
    "calculate",
    (data, callback?) => {
      if (!data) return;
      console.log("收到计算请求:", data);

      let result: number;
      switch (data.operation) {
        case "add":
          result = data.a + data.b;
          break;
        case "subtract":
          result = data.a - data.b;
          break;
        case "multiply":
          result = data.a * data.b;
          break;
        case "divide":
          result = data.b !== 0 ? data.a / data.b : NaN;
          break;
        default:
          result = NaN;
      }

      // 发送确认响应
      if (callback) {
        callback({
          success: !isNaN(result),
          result,
        });
      }
    },
  );
});

// 启动服务器
await server.listen();
console.log("Socket.IO 事件确认示例服务器运行在 http://localhost:3000");

// 创建客户端示例
const client = new Client({
  url: "http://localhost:3000",
  namespace: "/",
  autoConnect: true,
  autoReconnect: false,
});

client.on("connect", () => {
  console.log("客户端已连接");

  // 发送带确认的请求
  client.emit("get-user-info", "12345", (response) => {
    console.log("收到用户信息:", response);
  });

  // 发送数据库查询请求
  client.emit("query-database", "SELECT * FROM users", (response) => {
    console.log("收到查询结果:", response);
  });

  // 发送计算请求
  client.emit("calculate", { a: 10, b: 5, operation: "add" }, (response) => {
    console.log("收到计算结果:", response);
  });
});
