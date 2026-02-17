/**
 * @fileoverview 硬件加速器测试
 */

import { describe, expect, it } from "@dreamer/test";
import { HardwareAccelerator } from "../src/hardware-accel/accelerator.ts";

describe("硬件加速器", () => {
  it("应该创建硬件加速器", () => {
    const accelerator = new HardwareAccelerator();
    expect(accelerator).toBeTruthy();
  });

  it("应该批量计算哈希", async () => {
    const accelerator = new HardwareAccelerator();
    const encoder = new TextEncoder();

    const data = [
      encoder.encode("数据1"),
      encoder.encode("数据2"),
      encoder.encode("数据3"),
    ];

    const hashes = await accelerator.batchHash(data);

    // 应该返回哈希数组
    expect(hashes).toBeInstanceOf(Uint32Array);
    expect(hashes.length).toBe(data.length);
    // 每个哈希值应该是数字
    for (let i = 0; i < hashes.length; i++) {
      expect(typeof hashes[i]).toBe("number");
    }
  });

  it("应该批量复制数据", () => {
    const accelerator = new HardwareAccelerator();
    const source = new Uint8Array([1, 2, 3, 4, 5]);
    const target = new Uint8Array(10);

    accelerator.batchCopy(source, target, 2);

    // 应该正确复制数据
    expect(target[2]).toBe(1);
    expect(target[3]).toBe(2);
    expect(target[4]).toBe(3);
    expect(target[5]).toBe(4);
    expect(target[6]).toBe(5);
  });

  it("应该批量比较数据", () => {
    const accelerator = new HardwareAccelerator();
    const encoder = new TextEncoder();

    const data1 = encoder.encode("测试数据");
    const data2 = encoder.encode("测试数据");
    const data3 = encoder.encode("不同数据");

    // 相同数据应该返回 true
    expect(accelerator.batchCompare(data1, data2)).toBe(true);
    // 不同数据应该返回 false
    expect(accelerator.batchCompare(data1, data3)).toBe(false);
  });

  it("应该批量编码数据", async () => {
    const accelerator = new HardwareAccelerator();

    const data = ["字符串1", "字符串2", "字符串3"];
    const encoded = await accelerator.batchEncode(data);

    // 应该返回编码后的数组
    expect(Array.isArray(encoded)).toBe(true);
    expect(encoded.length).toBe(data.length);
    // 每个元素应该是 Uint8Array
    for (const item of encoded) {
      expect(item).toBeInstanceOf(Uint8Array);
    }
  });

  it("应该检查 WebAssembly 可用性", () => {
    const accelerator = new HardwareAccelerator();
    const available = accelerator.wasmAvailable;

    // 应该返回布尔值
    expect(typeof available).toBe("boolean");
  });

  it("应该检查 SIMD 可用性", () => {
    const accelerator = new HardwareAccelerator();
    const available = accelerator.simdAvailable;

    // 应该返回布尔值
    expect(typeof available).toBe("boolean");
  });

  it("应该处理空数据", async () => {
    const accelerator = new HardwareAccelerator();

    // 批量哈希空数组
    const hashes = await accelerator.batchHash([]);
    expect(hashes.length).toBe(0);

    // 批量编码空数组
    const encoded = await accelerator.batchEncode([]);
    expect(encoded.length).toBe(0);
  });

  it("应该处理大数据", async () => {
    const accelerator = new HardwareAccelerator();
    const encoder = new TextEncoder();

    // 创建大量数据
    const data: Uint8Array[] = [];
    for (let i = 0; i < 100; i++) {
      data.push(encoder.encode(`数据项 ${i}`.repeat(100)));
    }

    const hashes = await accelerator.batchHash(data);
    expect(hashes.length).toBe(100);
  });
});
