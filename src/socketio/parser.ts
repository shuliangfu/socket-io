/**
 * @fileoverview Socket.IO 协议解析器
 * 处理 Socket.IO 数据包的编码和解码
 */

import { SocketIOPacket, SocketIOPacketType } from "../types.ts";

/**
 * Socket.IO 协议版本
 */
export const PROTOCOL_VERSION = 5;

/**
 * 编码 Socket.IO 数据包
 * @param packet 数据包对象
 * @returns 编码后的字符串
 */
export function encodePacket(packet: SocketIOPacket): string {
  let encoded = String(packet.type);

  // 添加命名空间（如果存在且不是默认命名空间）
  if (packet.nsp && packet.nsp !== "/") {
    encoded += packet.nsp + ",";
  }

  // 添加确认 ID（如果存在）
  if (packet.id !== undefined) {
    encoded += String(packet.id);
  }

  // 添加数据
  if (packet.data !== undefined) {
    if (packet.attachments !== undefined && packet.attachments > 0) {
      // 二进制数据包
      encoded += String(packet.attachments) + "-";
    }
    encoded += JSON.stringify(packet.data);
  }

  return encoded;
}

/**
 * 解码 Socket.IO 数据包
 * @param encoded 编码后的字符串
 * @returns 数据包对象
 */
export function decodePacket(encoded: string): SocketIOPacket {
  if (encoded.length === 0) {
    throw new Error("空数据包");
  }

  const type = parseInt(encoded[0], 10) as SocketIOPacketType;
  let i = 1;

  // 解析命名空间
  // Socket.IO 协议格式：type + [nsp + ","] + [id] + [attachments + "-"] + [data]
  // 如果第二个字符是 "/" 且后面有逗号，说明有命名空间
  let nsp = "/";
  if (i < encoded.length && encoded[i] === "/") {
    // 查找逗号
    const commaIndex = encoded.indexOf(",", i);
    if (commaIndex !== -1) {
      // 有命名空间
      nsp = encoded.slice(i, commaIndex);
      i = commaIndex + 1;
    }
    // 如果没有逗号，说明是默认命名空间 "/"，继续解析
  }

  // 解析确认 ID
  let id: number | undefined;
  let idEnd = i;
  while (idEnd < encoded.length && /[0-9]/.test(encoded[idEnd])) {
    idEnd++;
  }
  if (idEnd > i) {
    id = parseInt(encoded.slice(i, idEnd), 10);
    i = idEnd;
  }

  // 解析附件数量（二进制数据）
  let attachments: number | undefined;
  if (i < encoded.length && encoded[i] === "-") {
    i++;
    let attEnd = i;
    while (attEnd < encoded.length && /[0-9]/.test(encoded[attEnd])) {
      attEnd++;
    }
    if (attEnd > i) {
      attachments = parseInt(encoded.slice(i, attEnd), 10);
      i = attEnd;
    }
  }

  // 解析数据
  let data: any;
  if (i < encoded.length) {
    try {
      data = JSON.parse(encoded.slice(i));
    } catch {
      // 如果解析失败，可能是二进制数据，暂时忽略
      data = undefined;
    }
  }

  const packet: SocketIOPacket = { type, nsp };
  if (id !== undefined) {
    packet.id = id;
  }
  if (data !== undefined) {
    packet.data = data;
  }
  if (attachments !== undefined) {
    packet.attachments = attachments;
  }

  return packet;
}
