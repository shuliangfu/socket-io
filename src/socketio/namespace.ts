/**
 * @fileoverview Socket.IO 命名空间
 * 管理命名空间内的 Socket 连接
 */

import type { SocketIOAdapter } from "../adapters/types.ts";
import { EngineSocket } from "../engine/socket.ts";
import {
  Middleware,
  ServerEventListener,
  SocketIOPacketType,
} from "../types.ts";
import { MessageCache } from "./message-cache.ts";
import { MessageQueue } from "./message-queue.ts";
import { SocketPool } from "./socket-pool.ts";
import { type RoomManager, SocketIOSocket } from "./socket.ts";

/**
 * Socket.IO 命名空间
 */
export class Namespace {
  /** 命名空间名称 */
  public readonly name: string;
  /** Socket 连接池 */
  private sockets: Map<string, SocketIOSocket> = new Map();
  /** 房间到 Socket 的映射（房间名称 -> Set<Socket ID>） */
  private rooms: Map<string, Set<string>> = new Map();
  /** Socket 到房间的映射（Socket ID -> Set<房间名称>） */
  private socketToRooms: Map<string, Set<string>> = new Map();
  /** 事件监听器 */
  private listeners: ServerEventListener[] = [];
  /** 中间件列表 */
  private middlewares: Middleware[] = [];
  /** 消息缓存 */
  private messageCache: MessageCache;
  /** Socket 对象池 */
  private socketPool: SocketPool = new SocketPool(1000);
  /** 消息队列 */
  private messageQueue: MessageQueue = new MessageQueue(10000, 100);
  /** 分布式适配器（可选） */
  private adapter?: SocketIOAdapter;

  /**
   * 创建命名空间实例
   *
   * 命名空间用于隔离不同的业务场景，每个命名空间有独立的 Socket 连接和房间管理。
   *
   * @param name - 命名空间名称，必须以 "/" 开头，例如 "/chat", "/game"
   * @param adapter - 分布式适配器（可选），用于在多服务器环境下同步消息
   * @param accelerator - 硬件加速器（可选），用于加速消息缓存等计算密集型操作
   *
   * @example
   * ```typescript
   * const namespace = new Namespace("/chat", adapter);
   * ```
   */
  constructor(
    name: string,
    adapter?: SocketIOAdapter,
    accelerator?:
      import("../hardware-accel/accelerator.ts").HardwareAccelerator,
  ) {
    this.name = name;
    this.adapter = adapter;
    this.messageCache = new MessageCache(1000, accelerator);
  }

  /**
   * 设置分布式适配器
   *
   * 分布式适配器用于在多服务器环境下同步消息和房间状态。
   * 支持 Redis、MongoDB 和 Memory 适配器。
   *
   * @param adapter - 分布式适配器实例
   *
   * @example
   * ```typescript
   * const adapter = new RedisAdapter(redisClient);
   * namespace.setAdapter(adapter);
   * ```
   */
  setAdapter(adapter: SocketIOAdapter): void {
    this.adapter = adapter;
  }

  /**
   * 添加连接中间件
   *
   * 中间件在 Socket 连接建立前执行，可以用于身份验证、权限检查等。
   * 如果中间件调用 `next(error)`，连接将被拒绝。
   *
   * @param middleware - 中间件函数，接收 Socket 实例和 next 回调
   *
   * @example
   * ```typescript
   * namespace.use((socket, next) => {
   *   if (socket.handshake.auth.token === "valid") {
   *     next();
   *   } else {
   *     next(new Error("未授权"));
   *   }
   * });
   * ```
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 监听连接事件
   *
   * 当有新的 Socket 连接到该命名空间时，会触发 connection 事件。
   * 可以注册多个监听器，它们会按注册顺序依次调用。
   *
   * @param event - 事件名称，必须是 "connection"
   * @param listener - 监听器函数，接收 Socket 实例作为参数
   *
   * @throws {Error} 如果事件名称不是 "connection" 则抛出错误
   *
   * @example
   * ```typescript
   * namespace.on("connection", (socket) => {
   *   console.log("新连接:", socket.id);
   *   socket.emit("welcome", { message: "欢迎加入" });
   * });
   * ```
   */
  on(event: "connection", listener: ServerEventListener): void {
    if (event !== "connection") {
      throw new Error(`不支持的事件: ${event}`);
    }
    this.listeners.push(listener);
  }

  /**
   * 添加 Socket 连接到命名空间
   *
   * 将 Engine.IO Socket 包装为 Socket.IO Socket 并添加到命名空间。
   * 在添加前会执行所有中间件，如果中间件拒绝连接，则不会添加。
   *
   * @param engineSocket - Engine.IO Socket 实例
   * @returns Promise<SocketIOSocket> 返回创建的 Socket.IO Socket 实例
   *
   * @throws {Error} 如果中间件拒绝连接则抛出错误
   *
   * @internal
   */
  async addSocket(engineSocket: EngineSocket): Promise<SocketIOSocket> {
    // 执行中间件
    for (const middleware of this.middlewares) {
      await new Promise<void>((resolve, reject) => {
        const socket = new SocketIOSocket(engineSocket, this.name);
        middleware(socket, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    // 从对象池获取 Socket.IO Socket
    const socket = this.socketPool.acquire(engineSocket, this.name);

    // 监听断开连接事件
    socket.on("disconnect", () => {
      this.removeSocket(socket.id);
    });

    // 创建房间管理器，让 Socket 使用命名空间的房间管理
    const roomManager: RoomManager = {
      getSocketsInRoom: (room: string) => {
        const roomSockets = this.rooms.get(room);
        if (!roomSockets) {
          return [];
        }
        return Array.from(roomSockets)
          .map((id) => this.sockets.get(id))
          .filter((s) => s && s.connected) as SocketIOSocket[];
      },
      getAllSockets: () => {
        return Array.from(this.sockets.values()).filter((s) => s.connected);
      },
      getMessageCache: () => this.messageCache,
      getMessageQueue: () => this.messageQueue,
      getAdapter: () => this.adapter,
      getNamespaceName: () => this.name,
    };

    // 设置房间管理器
    socket.setRoomManager(roomManager);

    // 监听加入房间事件（需要手动处理，因为 Socket 不知道命名空间）
    const originalJoin = socket.join.bind(socket);
    socket.join = (room: string) => {
      originalJoin(room);
      this.addSocketToRoom(socket.id, room);
      // 确保 socket.rooms 包含这个房间
      (socket as any)._rooms?.add(room);
    };

    const originalLeave = socket.leave.bind(socket);
    socket.leave = (room: string) => {
      originalLeave(room);
      this.removeSocketFromRoom(socket.id, room);
      // 确保 socket.rooms 移除这个房间
      (socket as any)._rooms?.delete(room);
    };

    // Socket 现在会使用房间管理器，不需要重写 to() 和 broadcast 方法
    // Socket 的 to() 和 broadcast 方法已经可以正常工作了

    // 添加到连接池
    this.sockets.set(socket.id, socket);

    // 触发连接事件
    for (const listener of this.listeners) {
      try {
        listener(socket);
      } catch (error) {
        console.error("连接事件监听器错误:", error);
      }
    }

    return socket;
  }

  /**
   * 移除 Socket 连接
   *
   * 从命名空间中移除指定的 Socket，包括：
   * 1. 从所有房间中移除该 Socket
   * 2. 从连接池中移除
   * 3. 释放 Socket 对象到对象池以便重用
   *
   * @param socketId - Socket 的唯一标识符
   *
   * @internal
   */
  removeSocket(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) {
      return;
    }

    // 从所有房间中移除（使用索引优化）
    const socketRooms = this.socketToRooms.get(socketId);
    if (socketRooms) {
      for (const room of socketRooms) {
        this.removeSocketFromRoom(socketId, room);
      }
      this.socketToRooms.delete(socketId);
    }

    // 从连接池中移除并释放到对象池
    this.socketPool.release(socket);
    this.sockets.delete(socketId);
  }

  /**
   * 添加 Socket 到房间
   *
   * 更新房间索引和 Socket 索引，如果配置了分布式适配器，会通知适配器。
   *
   * @param socketId - Socket 的唯一标识符
   * @param room - 房间名称
   *
   * @internal
   */
  addSocketToRoom(socketId: string, room: string): void {
    // 更新房间索引
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(socketId);

    // 更新 Socket 索引
    if (!this.socketToRooms.has(socketId)) {
      this.socketToRooms.set(socketId, new Set());
    }
    this.socketToRooms.get(socketId)!.add(room);

    // 通知适配器
    if (this.adapter) {
      const result = this.adapter.addSocketToRoom(socketId, room, this.name);
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("适配器添加 Socket 到房间失败:", error);
        });
      }
    }
  }

  /**
   * 从房间中移除 Socket
   *
   * 更新房间索引和 Socket 索引，如果房间为空则删除房间。
   * 如果配置了分布式适配器，会通知适配器。
   *
   * @param socketId - Socket 的唯一标识符
   * @param room - 房间名称
   *
   * @internal
   */
  removeSocketFromRoom(socketId: string, room: string): void {
    // 从房间索引中移除
    const roomSockets = this.rooms.get(room);
    if (roomSockets) {
      roomSockets.delete(socketId);
      if (roomSockets.size === 0) {
        this.rooms.delete(room);
      }
    }

    // 从 Socket 索引中移除
    const socketRooms = this.socketToRooms.get(socketId);
    if (socketRooms) {
      socketRooms.delete(room);
      if (socketRooms.size === 0) {
        this.socketToRooms.delete(socketId);
      }
    }

    // 通知适配器
    if (this.adapter) {
      const result = this.adapter.removeSocketFromRoom(
        socketId,
        room,
        this.name,
      );
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("适配器从房间移除 Socket 失败:", error);
        });
      }
    }
  }

  /**
   * 向指定房间内的所有 Socket 发送事件
   *
   * 返回一个链式调用对象，可以继续调用 `to()`, `in()`, `except()`, `compress()` 等方法，
   * 最后调用 `emit()` 发送消息。
   *
   * 使用消息缓存和消息队列优化性能，支持通过适配器广播到其他服务器。
   *
   * @param room - 房间名称
   * @returns 返回一个链式调用对象，包含 `emit`, `to`, `in`, `except`, `compress` 等方法
   *
   * @example
   * ```typescript
   * // 向房间发送消息
   * namespace.to("room-123").emit("message", { text: "Hello" });
   *
   * // 链式调用：向多个房间发送，排除某些 Socket
   * namespace.to("room-1").to("room-2").except("socket-id-123").emit("message", data);
   * ```
   */
  to(room: string): {
    emit: (event: string, data?: any) => void;
    to: (room: string) => ReturnType<Namespace["to"]>;
    in: (room: string) => ReturnType<Namespace["to"]>;
    except: (room: string | string[]) => ReturnType<Namespace["to"]>;
    compress: (value: boolean) => ReturnType<Namespace["to"]>;
  } {
    const targetRooms = new Set<string>([room]);
    const except = new Set<string>();

    const builder = {
      to: (r: string) => {
        targetRooms.add(r);
        return builder;
      },
      in: (r: string) => {
        targetRooms.add(r);
        return builder;
      },
      except: (r: string | string[]) => {
        const rooms = Array.isArray(r) ? r : [r];
        rooms.forEach((roomId) => except.add(roomId));
        return builder;
      },
      compress: (_value: boolean) => {
        // 压缩功能由命名空间统一管理
        return builder;
      },
      emit: (event: string, data?: any) => {
        // 收集所有目标房间的 socket
        const targetSocketIds = new Set<string>();
        for (const targetRoom of targetRooms) {
          const roomSockets = this.rooms.get(targetRoom);
          if (roomSockets) {
            for (const socketId of roomSockets) {
              // 排除 except 列表中的 socket
              if (!except.has(socketId)) {
                targetSocketIds.add(socketId);
              }
            }
          }
        }

        if (targetSocketIds.size === 0) {
          return;
        }

        // 使用消息缓存，只序列化一次
        const packet = {
          type: SocketIOPacketType.EVENT,
          nsp: this.name,
          data: [event, data],
        };
        const encoded = this.messageCache.getOrCreate(packet);

        // 批量发送
        const socketArray = Array.from(targetSocketIds)
          .map((id) => this.sockets.get(id))
          .filter((s) => s && s.connected) as SocketIOSocket[];

        // 使用消息队列批量发送
        for (const targetSocket of socketArray) {
          this.messageQueue.enqueue(targetSocket, encoded, 0);
        }

        // 通过适配器广播到其他服务器
        if (this.adapter) {
          const adapterPacket = {
            type: SocketIOPacketType.EVENT,
            nsp: this.name,
            data: [event, data],
          };
          // 向所有目标房间广播
          for (const targetRoom of targetRooms) {
            const result = this.adapter.broadcastToRoom(targetRoom, {
              namespace: this.name,
              room: targetRoom,
              packet: adapterPacket,
            });
            if (result instanceof Promise) {
              result.catch((error) => {
                console.error("适配器房间广播失败:", error);
              });
            }
          }
        }
      },
    };

    return builder;
  }

  /**
   * in() 是 to() 的别名
   *
   * 功能与 `to()` 方法完全相同，只是为了提供更符合语义的 API。
   *
   * @param room - 房间名称
   * @returns 返回与 `to()` 方法相同的链式调用对象
   *
   * @example
   * ```typescript
   * namespace.in("room-123").emit("message", { text: "Hello" });
   * ```
   */
  in(room: string): ReturnType<Namespace["to"]> {
    return this.to(room);
  }

  /**
   * 排除指定的房间或 Socket ID
   *
   * 返回一个链式调用对象，可以配合 `to()` 或 `in()` 使用，排除指定的 Socket。
   *
   * @param room - 房间名称或 Socket ID，或数组（可以同时排除多个）
   * @returns 返回一个链式调用对象，包含 `emit`, `to`, `in`, `except`, `compress` 等方法
   *
   * @example
   * ```typescript
   * // 向房间发送消息，但排除特定 Socket
   * namespace.to("room-123").except("socket-id-456").emit("message", data);
   *
   * // 排除多个 Socket
   * namespace.to("room-123").except(["socket-1", "socket-2"]).emit("message", data);
   * ```
   */
  except(room: string | string[]): {
    emit: (event: string, data?: any) => void;
    to: (room: string) => ReturnType<Namespace["to"]>;
    in: (room: string) => ReturnType<Namespace["to"]>;
    except: (room: string | string[]) => ReturnType<Namespace["except"]>;
    compress: (value: boolean) => ReturnType<Namespace["except"]>;
  } {
    const exceptSet = new Set<string>();
    const rooms = Array.isArray(room) ? room : [room];
    rooms.forEach((r) => exceptSet.add(r));

    const builder = {
      to: (r: string) => {
        // 调用 to() 方法，然后在 emit 时排除指定的 socket
        const toBuilder = this.to(r);
        // 重写 emit 方法，添加 except 过滤
        toBuilder.emit = (event: string, data?: any) => {
          // 先获取目标房间的所有 socket
          const targetRooms = new Set<string>([r]);
          const targetSocketIds = new Set<string>();
          for (const targetRoom of targetRooms) {
            const roomSockets = this.rooms.get(targetRoom);
            if (roomSockets) {
              for (const socketId of roomSockets) {
                // 排除 except 列表中的 socket
                if (!exceptSet.has(socketId)) {
                  targetSocketIds.add(socketId);
                }
              }
            }
          }

          if (targetSocketIds.size === 0) {
            return;
          }

          // 使用消息缓存，只序列化一次
          const packet = {
            type: SocketIOPacketType.EVENT,
            nsp: this.name,
            data: [event, data],
          };
          const encoded = this.messageCache.getOrCreate(packet);

          // 批量发送
          const socketArray = Array.from(targetSocketIds)
            .map((id) => this.sockets.get(id))
            .filter((s) => s && s.connected) as SocketIOSocket[];

          // 使用消息队列批量发送
          for (const targetSocket of socketArray) {
            this.messageQueue.enqueue(targetSocket, encoded, 0);
          }

          // 通过适配器广播到其他服务器
          if (this.adapter) {
            const adapterPacket = {
              type: SocketIOPacketType.EVENT,
              nsp: this.name,
              data: [event, data],
            };
            for (const targetRoom of targetRooms) {
              const result = this.adapter.broadcastToRoom(targetRoom, {
                namespace: this.name,
                room: targetRoom,
                packet: adapterPacket,
              });
              if (result instanceof Promise) {
                result.catch((error) => {
                  console.error("适配器房间广播失败:", error);
                });
              }
            }
          }
        };
        return toBuilder;
      },
      in: (r: string) => {
        return builder.to(r);
      },
      except: (r: string | string[]) => {
        const rooms = Array.isArray(r) ? r : [r];
        rooms.forEach((roomId) => exceptSet.add(roomId));
        return builder;
      },
      compress: (_value: boolean) => {
        // 压缩功能由命名空间统一管理
        return builder;
      },
      emit: (event: string, data?: any) => {
        // 如果没有指定房间，则向所有 socket 广播（除了排除的）
        const allSocketIds = new Set<string>();
        for (const socket of this.sockets.values()) {
          if (socket.connected && !exceptSet.has(socket.id)) {
            allSocketIds.add(socket.id);
          }
        }

        if (allSocketIds.size === 0) {
          return;
        }

        // 使用消息缓存，只序列化一次
        const packet = {
          type: SocketIOPacketType.EVENT,
          nsp: this.name,
          data: [event, data],
        };
        const encoded = this.messageCache.getOrCreate(packet);

        // 批量发送
        const socketArray = Array.from(allSocketIds)
          .map((id) => this.sockets.get(id))
          .filter((s) => s && s.connected) as SocketIOSocket[];

        // 使用消息队列批量发送
        for (const targetSocket of socketArray) {
          this.messageQueue.enqueue(targetSocket, encoded, 0);
        }

        // 通过适配器广播到其他服务器
        if (this.adapter) {
          const adapterPacket = {
            type: SocketIOPacketType.EVENT,
            nsp: this.name,
            data: [event, data],
          };
          const result = this.adapter.broadcast({
            namespace: this.name,
            event,
            data,
            packet: adapterPacket,
          });
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error("适配器全局广播失败:", error);
            });
          }
        }
      },
    };

    return builder;
  }

  /**
   * 向命名空间内所有 Socket 发送事件
   *
   * 使用消息缓存优化性能（只序列化一次），通过消息队列批量发送。
   * 如果配置了分布式适配器，会通过适配器广播到其他服务器。
   *
   * @param event - 事件名称，可以是任意字符串
   * @param data - 事件数据，可以是任意类型
   *
   * @example
   * ```typescript
   * // 向所有连接的 Socket 发送通知
   * namespace.emit("system-notification", { message: "系统维护中" });
   * ```
   */
  emit(event: string, data?: any): void {
    if (this.sockets.size === 0) {
      return;
    }

    // 使用消息缓存，只序列化一次
    const packet = {
      type: SocketIOPacketType.EVENT,
      nsp: this.name,
      data: [event, data],
    };
    const encoded = this.messageCache.getOrCreate(packet);

    // 批量发送（大量连接时分批处理）
    const socketArray = Array.from(this.sockets.values())
      .filter((s) => s.connected);

    // 使用消息队列批量发送
    for (const socket of socketArray) {
      this.messageQueue.enqueue(socket, encoded, 0);
    }

    // 通过适配器广播到其他服务器
    if (this.adapter) {
      const result = this.adapter.broadcast({
        namespace: this.name,
        event,
        data,
        packet,
      });
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("适配器全局广播失败:", error);
        });
      }
    }
  }

  /**
   * 根据 Socket ID 获取 Socket 实例
   *
   * @param socketId - Socket 的唯一标识符
   * @returns 如果找到返回 Socket 实例，否则返回 undefined
   *
   * @example
   * ```typescript
   * const socket = namespace.getSocket("socket-id-123");
   * if (socket) {
   *   socket.emit("message", { text: "Hello" });
   * }
   * ```
   */
  getSocket(socketId: string): SocketIOSocket | undefined {
    return this.sockets.get(socketId);
  }

  /**
   * 获取命名空间内所有 Socket 的映射
   *
   * 返回一个 Map，键为 Socket ID，值为 Socket 实例。
   * 返回的是副本，修改不会影响原始映射。
   *
   * @returns Socket ID 到 Socket 实例的映射
   *
   * @example
   * ```typescript
   * const sockets = namespace.getSockets();
   * console.log(`当前有 ${sockets.size} 个连接`);
   * ```
   */
  getSockets(): Map<string, SocketIOSocket> {
    return new Map(this.sockets);
  }

  /**
   * 获取指定房间内的 Socket 数量
   *
   * @param room - 房间名称
   * @returns 房间内的 Socket 数量，如果房间不存在返回 0
   *
   * @example
   * ```typescript
   * const size = namespace.getRoomSize("room-123");
   * console.log(`房间内有 ${size} 个 Socket`);
   * ```
   */
  getRoomSize(room: string): number {
    return this.rooms.get(room)?.size || 0;
  }

  /**
   * 批量让 Socket 加入房间（标准 Socket.IO API）
   *
   * 根据过滤条件选择 Socket，然后让它们加入指定的房间。
   * 如果配置了分布式适配器，会通过适配器同步到其他服务器。
   *
   * @param rooms - 房间名称或房间名称数组
   * @param filter - 过滤函数（可选），用于选择要加入房间的 Socket
   * @returns Promise<void> 操作完成时解析
   *
   * @example
   * ```typescript
   * // 让所有 Socket 加入房间
   * await namespace.socketsJoin("room-123");
   *
   * // 让符合条件的 Socket 加入多个房间
   * await namespace.socketsJoin(["room-1", "room-2"], (socket) => {
   *   return socket.data.userId === "user-123";
   * });
   * ```
   */
  async socketsJoin(
    rooms: string | string[],
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<void> {
    const roomArray = Array.isArray(rooms) ? rooms : [rooms];
    const sockets = await this.fetchSockets(filter);
    for (const socket of sockets) {
      for (const room of roomArray) {
        socket.join(room);
      }
    }
  }

  /**
   * 批量让 Socket 离开房间（标准 Socket.IO API）
   *
   * 根据过滤条件选择 Socket，然后让它们离开指定的房间。
   * 如果配置了分布式适配器，会通过适配器同步到其他服务器。
   *
   * @param rooms - 房间名称或房间名称数组
   * @param filter - 过滤函数（可选），用于选择要离开房间的 Socket
   * @returns Promise<void> 操作完成时解析
   *
   * @example
   * ```typescript
   * // 让所有 Socket 离开房间
   * await namespace.socketsLeave("room-123");
   *
   * // 让符合条件的 Socket 离开多个房间
   * await namespace.socketsLeave(["room-1", "room-2"], (socket) => {
   *   return socket.data.userId === "user-123";
   * });
   * ```
   */
  async socketsLeave(
    rooms: string | string[],
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<void> {
    const roomArray = Array.isArray(rooms) ? rooms : [rooms];
    const sockets = await this.fetchSockets(filter);
    for (const socket of sockets) {
      for (const room of roomArray) {
        socket.leave(room);
      }
    }
  }

  /**
   * 批量断开连接（标准 Socket.IO API）
   * @param close 是否关闭底层连接（默认：false）
   * @param filter 过滤函数（可选）
   */
  async disconnectSockets(
    close = false,
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<void> {
    const sockets = await this.fetchSockets(filter);
    for (const socket of sockets) {
      socket.disconnect();
      if (close) {
        socket.getEngineSocket().close();
      }
    }
  }

  /**
   * 获取匹配条件下的 Socket 实例集（标准 Socket.IO API）
   *
   * 根据过滤条件收集命名空间内符合条件的 Socket 实例。
   * 如果配置了分布式适配器，可能会从其他服务器获取远程 Socket。
   *
   * @param filter - 过滤函数（可选），用于选择符合条件的 Socket
   * @returns Promise<SocketIOSocket[]> Socket 实例数组
   *
   * @example
   * ```typescript
   * // 获取所有 Socket
   * const allSockets = await namespace.fetchSockets();
   *
   * // 获取符合条件的 Socket
   * const userSockets = await namespace.fetchSockets((socket) => {
   *   return socket.data.userId === "user-123";
   * });
   * ```
   */
  async fetchSockets(
    filter?: (socket: SocketIOSocket) => boolean,
  ): Promise<SocketIOSocket[]> {
    // 标准 Socket.IO API 中 fetchSockets 是异步的（可能需要从适配器获取远程 socket）
    // 我们的实现是同步的，但保持异步接口以保持 API 一致性
    await Promise.resolve();
    const sockets: SocketIOSocket[] = [];
    for (const socket of this.sockets.values()) {
      if (socket.connected) {
        if (!filter || filter(socket)) {
          sockets.push(socket);
        }
      }
    }
    return sockets;
  }
}
