/**
 * @fileoverview Engine.IO 协议解析器
 * 处理 Engine.IO 数据包的编码和解码
 */

import { EnginePacket, EnginePacketType } from "../types.ts";

/**
 * Engine.IO 协议版本
 */
export const PROTOCOL_VERSION = 4;

/**
 * 编码 Engine.IO 数据包
 * @param packet 数据包对象
 * @returns 编码后的字符串
 */
export function encodePacket(packet: EnginePacket): string {
  let encoded = String(packet.type);

  if (packet.data !== undefined) {
    if (typeof packet.data === "string") {
      encoded += packet.data;
    } else {
      // 二进制数据需要 base64 编码
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(packet.data)),
      );
      encoded += "b" + base64;
    }
  }

  return encoded;
}

/**
 * 解码 Engine.IO 数据包
 * @param encoded 编码后的字符串
 * @returns 数据包对象
 */
export function decodePacket(encoded: string): EnginePacket {
  if (encoded.length === 0) {
    throw new Error("Empty packet");
  }

  const type = parseInt(encoded[0], 10) as EnginePacketType;
  const data = encoded.slice(1);

  if (data.length === 0) {
    return { type };
  }

  // 检查是否是二进制数据（以 'b' 开头）
  if (data[0] === "b") {
    const base64 = data.slice(1);
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return { type, data: bytes };
  }

  return { type, data };
}

/**
 * 编码多个数据包（用于轮询传输）
 * @param packets 数据包数组
 * @returns 编码后的字符串
 */
export function encodePayload(packets: EnginePacket[]): string {
  if (packets.length === 0) {
    return "0:";
  }

  let payload = "";
  for (const packet of packets) {
    const encoded = encodePacket(packet);
    payload += `${encoded.length}:${encoded}`;
  }

  return payload;
}

/**
 * 解码多个数据包（用于轮询传输）
 * @param payload 编码后的字符串
 * @returns 数据包数组
 */
export function decodePayload(payload: string): EnginePacket[] {
  const packets: EnginePacket[] = [];
  let i = 0;

  while (i < payload.length) {
    // 查找冒号分隔符
    const colonIndex = payload.indexOf(":", i);
    if (colonIndex === -1) {
      break;
    }

    // 解析长度
    const length = parseInt(payload.slice(i, colonIndex), 10);
    if (isNaN(length) || length < 0) {
      throw new Error(
        `Invalid packet length: ${payload.slice(i, colonIndex)}`,
      );
    }

    // 提取数据包内容
    const start = colonIndex + 1;
    const end = start + length;
    if (end > payload.length) {
      throw new Error("Packet length out of range");
    }

    const packetData = payload.slice(start, end);
    // 如果长度为 0，跳过（空数据包）
    if (length > 0) {
      packets.push(decodePacket(packetData));
    }

    i = end;
  }

  return packets;
}
