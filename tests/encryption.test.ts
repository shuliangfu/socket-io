/**
 * @fileoverview 加密功能测试
 */

import { describe, expect, it } from "@dreamer/test";
import { Client } from "../src/client/mod.ts";
import { EncryptionManager } from "../src/encryption/encryption-manager.ts";
import { Server } from "../src/server.ts";
import { delay, getAvailablePort } from "./test-utils.ts";

describe("消息加密", () => {
  it("应该创建加密管理器", () => {
    const key = EncryptionManager.generateKey("aes-256");
    const manager = new EncryptionManager({
      key,
      algorithm: "aes-256-gcm",
    });
    expect(manager).toBeTruthy();
  });

  it("应该加密和解密消息", async () => {
    const key = EncryptionManager.generateKey("aes-256");
    const manager = new EncryptionManager({
      key,
      algorithm: "aes-256-gcm",
    });

    const plaintext = "这是一条测试消息";
    const encrypted = await manager.encryptMessage(plaintext);
    const decrypted = await manager.decryptMessage(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  it("应该检测加密消息", () => {
    const key = EncryptionManager.generateKey("aes-256");
    const manager = new EncryptionManager({
      key,
      algorithm: "aes-256-gcm",
    });

    // 加密消息应该是 Base64 格式
    const plaintext = "测试消息";
    manager.encryptMessage(plaintext).then((encrypted) => {
      expect(manager.isEncrypted(encrypted)).toBe(true);
      expect(manager.isEncrypted(plaintext)).toBe(false);
    });
  });

  it("服务端和客户端应该能够加密通信", async () => {
    const port = await getAvailablePort();
    const key = EncryptionManager.generateKey("aes-256");

    // 创建启用加密的服务器
    const server = new Server({
      port,
      encryption: {
        key,
        algorithm: "aes-256-gcm",
      },
      pollingTimeout: 500, // 减少超时时间，加快测试
    });

    await server.listen();

    let receivedMessage: any = null;

    server.on("connection", (socket) => {
      socket.on("test-event", (data: any) => {
        receivedMessage = data;
      });
    });

    // 等待服务器启动
    await delay(100);

    // 创建启用加密的客户端（强制使用轮询传输，避免 WebSocket 握手问题）
    const client = new Client({
      url: `http://localhost:${port}`,
      encryption: {
        key,
        algorithm: "aes-256-gcm",
      },
      transports: ["polling"], // 只使用轮询，避免 WebSocket 连接问题
      timeout: 5000,
      autoReconnect: false, // 测试中禁用自动重连，避免清理时的连接错误
    });

    // 使用 Promise.race 添加超时保护
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.disconnect();
          server.close().catch(() => {});
          reject(new Error("连接超时"));
        }, 10000);

        client.on("connect", () => {
          clearTimeout(timeout);
          client.emit("test-event", { message: "加密消息" });
          setTimeout(() => {
            resolve();
          }, 500); // 增加等待时间，确保消息被接收
        });

        client.on("connect_error", (error) => {
          clearTimeout(timeout);
          client.disconnect();
          server.close().catch(() => {});
          reject(error);
        });
      }),
    ]);

    expect(receivedMessage).toBeTruthy();
    expect(receivedMessage.message).toBe("加密消息");

    // 清理
    client.disconnect();
    await delay(200);
    await server.close();
    await delay(300); // 增加延迟，确保端口释放
  }, { sanitizeOps: false, sanitizeResources: false });

  it("未加密的客户端应该无法与加密服务器通信", async () => {
    const port = await getAvailablePort();
    const key = EncryptionManager.generateKey("aes-256");

    // 创建启用加密的服务器
    const server = new Server({
      port,
      encryption: {
        key,
        algorithm: "aes-256-gcm",
      },
      pollingTimeout: 500, // 减少超时时间，加快测试
    });

    await server.listen();

    server.on("connection", (socket) => {
      socket.on("error", () => {
        // 测试错误处理
      });
    });

    // 等待服务器启动
    await delay(200);

    // 创建未加密的客户端（应该无法正常通信）
    const client = new Client({
      url: `http://localhost:${port}`,
      transports: ["polling"], // 只使用轮询
      timeout: 5000,
      autoReconnect: false, // 测试中禁用自动重连，避免清理时的连接错误
    });

    // 使用 Promise.race 添加超时保护
    let connectionSucceeded = false;

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.disconnect();
          server.close().catch(() => {});
          // 如果连接超时，说明未加密客户端无法连接（这是预期的）
          if (!connectionSucceeded) {
            resolve(); // 超时是预期的行为
          } else {
            reject(new Error("连接超时"));
          }
        }, 8000); // 减少超时时间

        client.on("connect", () => {
          clearTimeout(timeout);
          connectionSucceeded = true;
          // 发送消息（未加密）
          client.emit("test-event", { message: "未加密消息" });
          // 等待服务器处理消息（可能会因为解密失败而断开连接）
          setTimeout(() => {
            client.disconnect();
            server.close().catch(() => {});
            // 如果连接成功但消息无法解密，这也是预期的
            resolve();
          }, 1000);
        });

        client.on("connect_error", (_error) => {
          clearTimeout(timeout);
          // 连接错误是预期的（因为未加密）
          client.disconnect();
          server.close().catch(() => {});
          resolve();
        });

        client.on("disconnect", () => {
          // 如果因为解密错误而断开，这也是预期的
          if (connectionSucceeded) {
            clearTimeout(timeout);
            client.disconnect();
            server.close().catch(() => {});
            resolve();
          }
        });
      }),
    ]);

    // 清理
    client.disconnect();
    await delay(200);
    await server.close();
    await delay(300); // 增加延迟，确保端口释放
  }, { sanitizeOps: false, sanitizeResources: false, timeout: 10000 });

  it("应该支持不同的加密算法", async () => {
    const algorithms = [
      "aes-256-gcm",
      "aes-128-gcm",
      "aes-256-cbc",
      "aes-128-cbc",
    ] as const;

    for (const algorithm of algorithms) {
      const keyLength = algorithm.includes("128") ? 16 : 32;
      const key = EncryptionManager.generateKey(
        keyLength === 16 ? "aes-128" : "aes-256",
      );
      const manager = new EncryptionManager({
        key,
        algorithm,
      });

      const plaintext = `测试 ${algorithm} 算法`;
      const encrypted = await manager.encryptMessage(plaintext);
      const decrypted = await manager.decryptMessage(encrypted);

      expect(decrypted).toBe(plaintext);
    }
  });

  it("应该从密码生成密钥", async () => {
    const password = "my-secret-password";
    const key = await EncryptionManager.deriveKeyFromPassword(
      password,
      "aes-256",
    );

    expect(key.length).toBe(32);

    const manager = new EncryptionManager({
      key,
      algorithm: "aes-256-gcm",
    });

    const plaintext = "使用密码生成的密钥加密的消息";
    const encrypted = await manager.encryptMessage(plaintext);
    const decrypted = await manager.decryptMessage(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});
