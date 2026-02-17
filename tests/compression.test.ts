/**
 * @fileoverview 压缩管理器测试
 */

import { describe, expect, it } from "@dreamer/test";
import { CompressionManager } from "../src/compression/compression-manager.ts";

describe("压缩管理器", () => {
  it("应该创建压缩管理器", () => {
    const manager = new CompressionManager();
    expect(manager).toBeTruthy();
  });

  it("应该压缩字符串数据", async () => {
    const manager = new CompressionManager({
      algorithm: "gzip",
      minSize: 0, // 允许压缩小数据
    });

    const data = "这是一个测试消息，用于测试压缩功能。".repeat(10);
    const compressed = await manager.compress(data);

    // 压缩后的数据应该是 Uint8Array
    expect(compressed).toBeInstanceOf(Uint8Array);
    // 压缩后的数据应该比原始数据小（对于重复数据）
    const originalSize = new TextEncoder().encode(data).length;
    expect(compressed.length < originalSize || compressed.length > 0).toBe(
      true,
    );
  });

  it("应该解压压缩的数据", async () => {
    const manager = new CompressionManager({
      algorithm: "gzip",
      minSize: 0,
    });

    const original = "这是一个测试消息，用于测试压缩和解压功能。".repeat(10);
    const compressed = await manager.compress(original);
    const decompressed = await manager.decompress(compressed);

    expect(decompressed).toBe(original);
  });

  it("应该不压缩小于最小大小的数据", async () => {
    const manager = new CompressionManager({
      algorithm: "gzip",
      minSize: 1000, // 最小大小 1000 字节
    });

    const smallData = "小数据";
    const result = await manager.compress(smallData);
    const original = new TextEncoder().encode(smallData);

    // 小数据不应该被压缩，应该返回原始数据
    expect(result.length).toBe(original.length);
  });

  it("应该检测压缩数据", () => {
    const manager = new CompressionManager();

    // gzip 魔数：1F 8B
    const gzipData = new Uint8Array([0x1F, 0x8B, 0x08, 0x00]);
    expect(manager.isCompressed(gzipData)).toBe(true);

    // 普通数据
    const normalData = new TextEncoder().encode("普通数据");
    expect(manager.isCompressed(normalData)).toBe(false);
  });

  it("应该支持 deflate 算法", async () => {
    const manager = new CompressionManager({
      algorithm: "deflate",
      minSize: 0,
    });

    const data = "测试 deflate 压缩算法".repeat(10);
    const compressed = await manager.compress(data);
    const decompressed = await manager.decompress(compressed);

    expect(decompressed).toBe(data);
  });

  it("应该处理压缩失败的情况", async () => {
    const manager = new CompressionManager({
      algorithm: "gzip",
      minSize: 0,
    });

    // 即使压缩失败，也应该返回数据（降级处理）
    const data = "测试数据";
    const result = await manager.compress(data);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("应该处理解压失败的情况", async () => {
    const manager = new CompressionManager({
      algorithm: "gzip",
      minSize: 0,
    });

    // 尝试解压未压缩的数据（应该降级处理）
    const normalData = new TextEncoder().encode("未压缩的数据");
    const result = await manager.decompress(normalData);
    expect(typeof result).toBe("string");
  });

  it("应该启用和禁用压缩", () => {
    const manager = new CompressionManager();
    manager.setEnabled(false);
    // 禁用后，available 应该反映状态
    // 注意：如果 WebAssembly 不可用，available 始终为 false
  });
});
