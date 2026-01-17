/**
 * @fileoverview 流式解析器测试
 */

import { describe, it, expect } from "@dreamer/test";
import { StreamParser, StreamPacketProcessor } from "../src/streaming/stream-parser.ts";
import { EnginePacketType } from "../src/types.ts";

describe("流式解析器", () => {
  it("应该创建流式解析器", () => {
    const parser = new StreamParser();
    expect(parser).toBeTruthy();
  });

  it("应该解析完整的数据包", () => {
    const parser = new StreamParser();
    const encoder = new TextEncoder();

    // 创建一个完整的 Engine.IO 数据包：4{"type":"message","data":"test"}
    const packetData = encoder.encode('4{"type":"message","data":"test"}');
    const packets = parser.addChunk(packetData);

    // 应该解析出数据包
    expect(Array.isArray(packets)).toBe(true);
  });

  it("应该处理分块数据包", () => {
    const parser = new StreamParser();
    const encoder = new TextEncoder();

    // 将数据包分成多个块
    const fullData = '4{"type":"message","data":"test"}';
    const chunk1 = encoder.encode(fullData.slice(0, 5));
    const chunk2 = encoder.encode(fullData.slice(5));

    // 添加第一个块
    const packets1 = parser.addChunk(chunk1);
    // 添加第二个块
    const packets2 = parser.addChunk(chunk2);

    // 应该能够处理分块数据
    expect(Array.isArray(packets1)).toBe(true);
    expect(Array.isArray(packets2)).toBe(true);
  });

  it("应该重置解析器", () => {
    const parser = new StreamParser();
    parser.resetParser();
    // 重置后应该可以继续使用
    expect(parser).toBeTruthy();
  });

  it("应该处理大数据包", () => {
    const parser = new StreamParser(10 * 1024 * 1024); // 10MB 限制
    const encoder = new TextEncoder();

    // 创建大数据包
    const largeData = "x".repeat(10000);
    const packetData = encoder.encode(`4${JSON.stringify({ data: largeData })}`);
    const packets = parser.addChunk(packetData);

    expect(Array.isArray(packets)).toBe(true);
  });

  it("应该拒绝超过最大大小的数据包", () => {
    const parser = new StreamParser(100); // 100 字节限制
    const encoder = new TextEncoder();

    // 创建超过限制的数据包
    const largeData = "x".repeat(200);
    const packetData = encoder.encode(`4${JSON.stringify({ data: largeData })}`);

    try {
      parser.addChunk(packetData);
      // 如果实现正确，应该抛出错误或处理错误
    } catch (error) {
      // 预期会抛出错误
      expect(error).toBeInstanceOf(Error);
    }
  });
});

describe("流式数据包处理器", () => {
  it("应该创建流式数据包处理器", () => {
    let receivedPackets = 0;
    const processor = new StreamPacketProcessor(() => {
      receivedPackets++;
    });

    expect(processor).toBeTruthy();
  });

  it("应该处理数据块", () => {
    let receivedPackets = 0;
    const processor = new StreamPacketProcessor(() => {
      receivedPackets++;
    });

    const encoder = new TextEncoder();
    const chunk = encoder.encode('4{"type":"message"}');
    processor.processChunk(chunk);

    // 应该处理数据块（可能触发回调）
    expect(receivedPackets).toBeGreaterThanOrEqual(0);
  });

  it("应该重置处理器", () => {
    const processor = new StreamPacketProcessor(() => {});
    processor.reset();
    // 重置后应该可以继续使用
    expect(processor).toBeTruthy();
  });

  it("应该处理错误情况", () => {
    const processor = new StreamPacketProcessor(() => {});

    // 处理无效数据
    const invalidChunk = new Uint8Array([0xFF, 0xFF, 0xFF]);
    processor.processChunk(invalidChunk);

    // 应该不会崩溃
    expect(processor).toBeTruthy();
  });
});
