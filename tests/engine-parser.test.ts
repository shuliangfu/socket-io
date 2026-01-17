/**
 * @fileoverview Engine.IO 协议解析器测试
 * 测试 Engine.IO 数据包的编码和解码功能
 */

import { describe, expect, it } from "@dreamer/test";
import { EnginePacketType } from "../src/types.ts";
import {
  decodePacket,
  decodePayload,
  encodePacket,
  encodePayload,
} from "../src/engine/parser.ts";

describe("Engine.IO 协议解析器", () => {
  describe("encodePacket", () => {
    it("应该编码 OPEN 数据包", () => {
      const packet = { type: EnginePacketType.OPEN };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("0");
    });

    it("应该编码带数据的 OPEN 数据包", () => {
      const packet = {
        type: EnginePacketType.OPEN,
        data: '{"sid":"test"}',
      };
      const encoded = encodePacket(packet);
      expect(encoded).toBe('0{"sid":"test"}');
    });

    it("应该编码 CLOSE 数据包", () => {
      const packet = { type: EnginePacketType.CLOSE };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("1");
    });

    it("应该编码 PING 数据包", () => {
      const packet = { type: EnginePacketType.PING };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("2");
    });

    it("应该编码 PONG 数据包", () => {
      const packet = { type: EnginePacketType.PONG };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("3");
    });

    it("应该编码 MESSAGE 数据包", () => {
      const packet = {
        type: EnginePacketType.MESSAGE,
        data: "hello",
      };
      const encoded = encodePacket(packet);
      expect(encoded).toBe("4hello");
    });

    it("应该编码二进制数据包", () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const packet = {
        type: EnginePacketType.MESSAGE,
        data: data,
      };
      const encoded = encodePacket(packet);
      expect(encoded).toMatch(/^4b/);
    });
  });

  describe("decodePacket", () => {
    it("应该解码 OPEN 数据包", () => {
      const encoded = "0";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(EnginePacketType.OPEN);
      expect(packet.data).toBeUndefined();
    });

    it("应该解码带数据的 OPEN 数据包", () => {
      const encoded = '0{"sid":"test"}';
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(EnginePacketType.OPEN);
      expect(packet.data).toBe('{"sid":"test"}');
    });

    it("应该解码 CLOSE 数据包", () => {
      const encoded = "1";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(EnginePacketType.CLOSE);
    });

    it("应该解码 PING 数据包", () => {
      const encoded = "2";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(EnginePacketType.PING);
    });

    it("应该解码 PONG 数据包", () => {
      const encoded = "3";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(EnginePacketType.PONG);
    });

    it("应该解码 MESSAGE 数据包", () => {
      const encoded = "4hello";
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(EnginePacketType.MESSAGE);
      expect(packet.data).toBe("hello");
    });

    it("应该解码二进制数据包", () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const encoded = encodePacket({
        type: EnginePacketType.MESSAGE,
        data: data,
      });
      const packet = decodePacket(encoded);
      expect(packet.type).toBe(EnginePacketType.MESSAGE);
      expect(packet.data).toBeInstanceOf(Uint8Array);
      expect(new Uint8Array(packet.data as Uint8Array)).toEqual(data);
    });

    it("应该处理空数据包", () => {
      expect(() => decodePacket("")).toThrow();
    });
  });

  describe("encodePayload", () => {
    it("应该编码空数据包数组", () => {
      const packets: any[] = [];
      const payload = encodePayload(packets);
      expect(payload).toBe("0:");
    });

    it("应该编码单个数据包", () => {
      const packets = [{ type: EnginePacketType.PING }];
      const payload = encodePayload(packets);
      expect(payload).toBe("1:2");
    });

    it("应该编码多个数据包", () => {
      const packets = [
        { type: EnginePacketType.PING },
        { type: EnginePacketType.PONG },
        { type: EnginePacketType.MESSAGE, data: "hello" },
      ];
      const payload = encodePayload(packets);
      expect(payload).toContain("1:2");
      expect(payload).toContain("1:3");
      expect(payload).toContain("6:4hello");
    });
  });

  describe("decodePayload", () => {
    it("应该解码空数据包", () => {
      const payload = "0:";
      const packets = decodePayload(payload);
      expect(packets).toEqual([]);
    });

    it("应该解码单个数据包", () => {
      const payload = "1:2";
      const packets = decodePayload(payload);
      expect(packets).toHaveLength(1);
      expect(packets[0].type).toBe(EnginePacketType.PING);
    });

    it("应该解码多个数据包", () => {
      const packets = [
        { type: EnginePacketType.PING },
        { type: EnginePacketType.PONG },
        { type: EnginePacketType.MESSAGE, data: "hello" },
      ];
      const payload = encodePayload(packets);
      const decoded = decodePayload(payload);
      expect(decoded).toHaveLength(3);
      expect(decoded[0].type).toBe(EnginePacketType.PING);
      expect(decoded[1].type).toBe(EnginePacketType.PONG);
      expect(decoded[2].type).toBe(EnginePacketType.MESSAGE);
      expect(decoded[2].data).toBe("hello");
    });

    it("应该处理无效的长度", () => {
      expect(() => decodePayload("abc:2")).toThrow();
    });

    it("应该处理数据包长度超出范围", () => {
      expect(() => decodePayload("100:2")).toThrow();
    });
  });

  describe("编码解码往返", () => {
    it("应该正确往返编码解码单个数据包", () => {
      const original = {
        type: EnginePacketType.MESSAGE,
        data: "test message",
      };
      const encoded = encodePacket(original);
      const decoded = decodePacket(encoded);
      expect(decoded.type).toBe(original.type);
      expect(decoded.data).toBe(original.data);
    });

    it("应该正确往返编码解码多个数据包", () => {
      const original = [
        { type: EnginePacketType.PING },
        { type: EnginePacketType.MESSAGE, data: "hello" },
        { type: EnginePacketType.PONG },
      ];
      const payload = encodePayload(original);
      const decoded = decodePayload(payload);
      expect(decoded).toHaveLength(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(decoded[i].type).toBe(original[i].type);
        if (original[i].data) {
          expect(decoded[i].data).toBe(original[i].data);
        }
      }
    });
  });
});
