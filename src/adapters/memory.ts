/**
 * @fileoverview 内存适配器
 * 默认适配器，用于单服务器场景，不进行分布式通信
 */

import type { SocketIOSocket } from "../socketio/socket.ts";
import type {
  AdapterMessage,
  AdapterSocketLike,
  SocketIOAdapter,
} from "./types.ts";

/**
 * 内存适配器（默认，单服务器）
 * 不进行分布式通信，所有操作都在本地完成
 */
export class MemoryAdapter implements SocketIOAdapter {
  private serverId: string = "";
  private sockets: Map<string, SocketIOSocket> = new Map();
  private rooms: Map<string, Map<string, Set<string>>> = new Map(); // namespace -> room -> socketIds
  private socketRooms: Map<string, Map<string, Set<string>>> = new Map(); // namespace -> socketId -> rooms

  init(serverId: string, sockets: Map<string, AdapterSocketLike>): void {
    this.serverId = serverId;
    this.sockets = sockets as Map<string, SocketIOSocket>;
  }

  close(): void {
    this.rooms.clear();
    this.socketRooms.clear();
  }

  addSocketToRoom(
    socketId: string,
    room: string,
    namespace: string = "/",
  ): void {
    // 获取命名空间的房间映射
    if (!this.rooms.has(namespace)) {
      this.rooms.set(namespace, new Map());
    }
    const namespaceRooms = this.rooms.get(namespace)!;

    if (!namespaceRooms.has(room)) {
      namespaceRooms.set(room, new Set());
    }
    namespaceRooms.get(room)!.add(socketId);

    // 更新 Socket 到房间的映射
    if (!this.socketRooms.has(namespace)) {
      this.socketRooms.set(namespace, new Map());
    }
    const namespaceSocketRooms = this.socketRooms.get(namespace)!;

    if (!namespaceSocketRooms.has(socketId)) {
      namespaceSocketRooms.set(socketId, new Set());
    }
    namespaceSocketRooms.get(socketId)!.add(room);
  }

  removeSocketFromRoom(
    socketId: string,
    room: string,
    namespace: string = "/",
  ): void {
    // 从房间中移除
    const namespaceRooms = this.rooms.get(namespace);
    if (namespaceRooms) {
      const roomSockets = namespaceRooms.get(room);
      if (roomSockets) {
        roomSockets.delete(socketId);
        if (roomSockets.size === 0) {
          namespaceRooms.delete(room);
        }
      }
    }

    // 从 Socket 的房间列表中移除
    const namespaceSocketRooms = this.socketRooms.get(namespace);
    if (namespaceSocketRooms) {
      const socketRooms = namespaceSocketRooms.get(socketId);
      if (socketRooms) {
        socketRooms.delete(room);
        if (socketRooms.size === 0) {
          namespaceSocketRooms.delete(socketId);
        }
      }
    }
  }

  async removeSocketFromAllRooms(
    socketId: string,
    namespace: string = "/",
  ): Promise<void> {
    const namespaceSocketRooms = this.socketRooms.get(namespace);
    if (namespaceSocketRooms) {
      const socketRooms = namespaceSocketRooms.get(socketId);
      if (socketRooms) {
        for (const room of socketRooms) {
          await this.removeSocketFromRoom(socketId, room, namespace);
        }
        namespaceSocketRooms.delete(socketId);
      }
    }
  }

  getSocketsInRoom(room: string, namespace: string = "/"): string[] {
    const namespaceRooms = this.rooms.get(namespace);
    if (!namespaceRooms) {
      return [];
    }
    const roomSockets = namespaceRooms.get(room);
    return roomSockets ? Array.from(roomSockets) : [];
  }

  getRoomsForSocket(socketId: string, namespace: string = "/"): string[] {
    const namespaceSocketRooms = this.socketRooms.get(namespace);
    if (!namespaceSocketRooms) {
      return [];
    }
    const socketRooms = namespaceSocketRooms.get(socketId);
    return socketRooms ? Array.from(socketRooms) : [];
  }

  broadcast(_message: AdapterMessage): void {
    // 内存适配器不需要跨服务器广播
    // 所有操作都在本地完成
  }

  broadcastToRoom(_room: string, _message: AdapterMessage): void {
    // 内存适配器不需要跨服务器广播
    // 所有操作都在本地完成
  }

  subscribe(
    _callback: (message: AdapterMessage, serverId: string) => void,
  ): void {
    // 内存适配器不需要订阅
  }

  unsubscribe(): void {
    // 内存适配器不需要取消订阅
  }

  getServerIds(): string[] {
    return [this.serverId];
  }

  registerServer(): void {
    // 内存适配器不需要注册服务器
  }

  unregisterServer(): void {
    // 内存适配器不需要注销服务器
  }
}
