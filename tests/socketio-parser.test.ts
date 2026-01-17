/**
 * @fileoverview Socket.IO 协议解析器测试
 * 测试 Socket.IO 数据包的编码和解码功能
 */

import { describe, expect, it } from "@dreamer/test";
import { SocketIOPacketType } from "../src/types.ts";
import { decodePacket, encodePacket } from "../src/socketio/parser.ts";

describe("Socket.IO 协议解析器", () => {
  describe("encodePacket", () => {
    it("应该编码 CONNECT 数据包", () => {
      const packet = { type: SocketIOPacketType.CONNECT };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("0");
    });

    it("应该编码带命名空间的 CONNECT 数据包", () => {
      const packet = {
        type: SocketIOPacketType.CONNECT,
        nsp: "/chat",
      };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("0/chat,");
    });

    it("应该编码 DISCONNECT 数据包", () => {
      const packet = { type: SocketIOPacketType.DISCONNECT };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("1");
    });

    it("应该编码 EVENT 数据包", () => {
      const packet = {
        type: SocketIOPacketType.EVENT,
        data: ["message", "hello"],
      };
      const encoded = encodePacket(packet);
      expect(encoded).toContain('["message","hello"]');
    });

    it("应该编码带确认 ID 的 EVENT 数据包", () => {
      const packet = {
        type: SocketIOPacketType.EVENT,
        id: 123,
        data: ["message", "hello"],
      };
      const encoded = encodePacket(packet);
      expect(encoded).toContain("123");
      expect(encoded).toContain('["message","hello"]');
    });

    it("应该编码 ACK 数据包", () => {
      const packet = {
        type: SocketIOPacketType.ACK,
        id: 123,
        data: { status: "ok" },
      };
      const encoded = encodePacket(packet);
      expect(encoded).toContain("123");
      expect(encoded).toContain('{"status":"ok"}');
    });

    it("应该编码 CONNECT_ERROR 数据包", () => {
      const packet = {
        type: SocketIOPacketType.CONNECT_ERROR,
        data: { message: "Connection failed" },
      };
      const encoded = encodePacket(packet);
      expect(encoded).toContain('{"message":"Connection failed"}');
    });
  });

  describe("decodePacket", () => {
    it("应该解码 CONNECT 数据包", () => {
      const encoded = "0";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(SocketIOPacketType.CONNECT);
      expect(packet.nsp).toBe("/");
    });

    it("应该解码带命名空间的 CONNECT 数据包", () => {
      const encoded = "0/chat,";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(SocketIOPacketType.CONNECT);
      expect(packet.nsp).toBe("/chat");
    });

    it("应该解码 DISCONNECT 数据包", () => {
      const encoded = "1";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(SocketIOPacketType.DISCONNECT);
    });

    it("应该解码 EVENT 数据包", () => {
      const packet = {
        type: SocketIOPacketType.EVENT,
        data: ["message", "hello"],
      };
      const encoded = encodePacket(packet);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(SocketIOPacketType.EVENT);
      expect(decoded.data).toEqual(["message", "hello"]);
    });

    it("应该解码带确认 ID 的 EVENT 数据包", () => {
      const packet = {
        type: SocketIOPacketType.EVENT,
        id: 123,
        data: ["message", "hello"],
      };
      const encoded = encodePacket(packet);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(SocketIOPacketType.EVENT);
      expect(decoded.id).toBe(123);
      expect(decoded.data).toEqual(["message", "hello"]);
    });

    it("应该解码 ACK 数据包", () => {
      const packet = {
        type: SocketIOPacketType.ACK,
        id: 123,
        data: { status: "ok" },
      };
      const encoded = encodePacket(packet);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(SocketIOPacketType.ACK);
      expect(decoded.id).toBe(123);
      expect(decoded.data).toEqual({ status: "ok" });
    });

    it("应该解码 CONNECT_ERROR 数据包", () => {
      const packet = {
        type: SocketIOPacketType.CONNECT_ERROR,
        data: { message: "Connection failed" },
      };
      const encoded = encodePacket(packet);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(SocketIOPacketType.CONNECT_ERROR);
      expect(decoded.data).toEqual({ message: "Connection failed" });
    });

    it("应该处理空数据包", () => {
      expect(() => decodePacket("")).toThrow();
    });
  });

  describe("编码解码往返", () => {
    it("应该正确往返编码解码 CONNECT 数据包", () => {
      const original = { type: SocketIOPacketType.CONNECT };
      const encoded = encodePacket(original);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(original.type);
      expect(decoded.nsp).toBe("/");
    });

    it("应该正确往返编码解码带命名空间的 EVENT 数据包", () => {
      const original = {
        type: SocketIOPacketType.EVENT,
        nsp: "/chat",
        data: ["message", "hello"],
      };
      const encoded = encodePacket(original);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(original.type);
      expect(decoded.nsp).toBe("/chat");
      expect(decoded.data).toEqual(original.data);
    });

    it("应该正确往返编码解码带确认 ID 的数据包", () => {
      const original = {
        type: SocketIOPacketType.EVENT,
        id: 456,
        data: ["test", { value: 123 }],
      };
      const encoded = encodePacket(original);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(original.type);
      expect(decoded.id).toBe(original.id);
      expect(decoded.data).toEqual(original.data);
    });
  });
});
