/**
 * @fileoverview Engine.IO Socket
 * 表示一个 Engine.IO 连接
 */

import type { Logger } from "@dreamer/logger";
import { EnginePacket, EnginePacketType, Handshake } from "../types.ts";
import { Transport } from "./transport.ts";
import { WebSocketTransport } from "./websocket-transport.ts";

/**
 * Engine.IO Socket 事件监听器
 */
export type EngineSocketEventListener = (packet: EnginePacket) => void;

/**
 * Engine.IO Socket
 */
export class EngineSocket {
  /** Socket ID */
  public readonly id: string;
  /** 握手信息 */
  public readonly handshake: Handshake;
  /** 当前传输方式 */
  private transport: Transport | null = null;
  /** 是否已升级到 WebSocket */
  private upgraded = false;
  /** 是否已连接 */
  private connected = false;
  /** 事件监听器 */
  private listeners: Set<EngineSocketEventListener> = new Set();
  /** 心跳定时器 */
  private pingTimer: number | null = null;
  /** 心跳超时定时器 */
  private pingTimeoutTimer: number | null = null;
  /** 心跳超时时间（毫秒） */
  private readonly pingTimeout: number;
  /** 心跳间隔（毫秒） */
  private readonly pingInterval: number;
  /** 是否禁用独立心跳（由批量心跳管理器管理） */
  private heartbeatDisabled = false;
  /** 关闭回调（用于 Server 清理 engineSockets、heartbeatManager 等，防止内存泄漏） */
  private onCloseCallback: (() => void) | null = null;
  /** 翻译函数（可选） */
  private tr: (
    key: string,
    fallback: string,
    params?: Record<string, string | number | boolean>,
  ) => string;
  /** Logger 实例（可选，用于统一日志输出） */
  private readonly logger?: Logger;

  /**
   * 创建 Engine.IO Socket
   * @param id Socket ID
   * @param handshake 握手信息
   * @param pingTimeout 心跳超时时间（毫秒）
   * @param pingInterval 心跳间隔（毫秒）
   * @param onClose 关闭时回调（可选，用于 Server 清理资源）
   * @param tr 翻译函数（可选，用于 i18n）
   * @param logger Logger 实例（可选，用于统一日志输出）
   */
  constructor(
    id: string,
    handshake: Handshake,
    pingTimeout: number = 20000,
    pingInterval: number = 25000,
    onClose?: () => void,
    tr?: (
      key: string,
      fallback: string,
      params?: Record<string, string | number | boolean>,
    ) => string,
    logger?: Logger,
  ) {
    this.id = id;
    this.handshake = handshake;
    this.pingTimeout = pingTimeout;
    this.pingInterval = pingInterval;
    this.onCloseCallback = onClose ?? null;
    this.tr = tr ?? ((_k: string, f: string) => f);
    this.logger = logger;
  }

  /**
   * 设置传输方式
   * @param transport 传输层
   */
  setTransport(transport: Transport): void {
    // 移除旧的传输层监听器
    if (this.transport) {
      this.transport.off(this.handleTransportPacket);
    }

    this.transport = transport;
    this.transport.on(this.handleTransportPacket.bind(this));

    // 如果是 WebSocket，标记为已升级
    if (transport instanceof WebSocketTransport) {
      this.upgraded = true;
    }

    // 如果还未连接，发送握手数据包
    if (!this.connected) {
      this.sendHandshake();
      this.connected = true;
      // 只有在未禁用心跳时才启动独立心跳
      if (!this.heartbeatDisabled) {
        this.startPing();
      }
    }
  }

  /**
   * 处理传输层数据包
   * @param packet 数据包
   */
  private handleTransportPacket(packet: EnginePacket): void {
    switch (packet.type) {
      case EnginePacketType.PING:
        // 收到心跳，回复 PONG
        this.send({
          type: EnginePacketType.PONG,
        });
        break;

      case EnginePacketType.PONG:
        // 收到心跳响应，重置超时定时器
        this.resetPingTimeout();
        break;

      case EnginePacketType.CLOSE:
        // 收到关闭信号
        this.close();
        break;

      case EnginePacketType.UPGRADE:
        // 升级传输方式（客户端请求）
        // 服务器端不需要处理，因为升级由服务器主动发起
        break;

      default:
        // 其他数据包，转发给监听器
        this.emit(packet);
        break;
    }
  }

  /**
   * 发送握手数据包
   */
  private sendHandshake(): void {
    const handshakeData = {
      sid: this.id,
      upgrades: ["websocket"],
      pingInterval: this.pingInterval,
      pingTimeout: this.pingTimeout,
    };

    this.send({
      type: EnginePacketType.OPEN,
      data: JSON.stringify(handshakeData),
    });
  }

  /**
   * 发送数据包
   * @param packet 数据包
   */
  send(packet: EnginePacket): void {
    if (!this.transport || this.transport.isClosed()) {
      return;
    }

    this.transport.send(packet);
  }

  /**
   * 添加事件监听器
   * @param listener 监听器函数
   */
  on(listener: EngineSocketEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除事件监听器
   * @param listener 监听器函数
   */
  off(listener: EngineSocketEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 触发事件
   * @param packet 数据包
   */
  private emit(packet: EnginePacket): void {
    for (const listener of this.listeners) {
      try {
        listener(packet);
      } catch (error) {
        (this.logger?.error ?? console.error)(
          this.tr(
            "log.socketioEngine.eventListenerError",
            "Engine.IO Socket 事件监听器错误",
          ),
          error,
        );
      }
    }
  }

  /**
   * 开始心跳
   */
  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({
        type: EnginePacketType.PING,
      });
      this.resetPingTimeout();
    }, this.pingInterval) as unknown as number;
  }

  /**
   * 重置心跳超时定时器
   */
  private resetPingTimeout(): void {
    if (this.pingTimeoutTimer) {
      clearTimeout(this.pingTimeoutTimer);
    }

    this.pingTimeoutTimer = setTimeout(() => {
      // 心跳超时，关闭连接
      this.close();
    }, this.pingTimeout) as unknown as number;
  }

  /**
   * 关闭 Socket
   * 会调用 onClose 回调，供 Server 清理 engineSockets、heartbeatManager 等，防止内存泄漏
   */
  close(): void {
    if (!this.connected && !this.transport) {
      return; // 已关闭，避免重复调用
    }

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.pingTimeoutTimer) {
      clearTimeout(this.pingTimeoutTimer);
      this.pingTimeoutTimer = null;
    }

    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }

    this.connected = false;

    // 通知 Server 清理资源（engineSockets、pollingTransports、heartbeatManager）
    if (this.onCloseCallback) {
      try {
        this.onCloseCallback();
      } catch (error) {
        (this.logger?.error ?? console.error)(
          this.tr(
            "log.socketioEngine.onCloseCallbackError",
            "EngineSocket onClose 回调错误",
          ),
          error,
        );
      }
      this.onCloseCallback = null;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected && this.transport !== null &&
      !this.transport.isClosed();
  }

  /**
   * 检查是否已升级到 WebSocket
   */
  isUpgraded(): boolean {
    return this.upgraded;
  }

  /**
   * 获取传输方式
   */
  getTransport(): Transport | null {
    return this.transport;
  }

  /**
   * 禁用独立心跳（由批量心跳管理器管理）
   */
  disableHeartbeat(): void {
    this.heartbeatDisabled = true;
    // 如果已经启动了心跳，停止它
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 启用独立心跳
   */
  enableHeartbeat(): void {
    this.heartbeatDisabled = false;
    // 如果已连接但未启动心跳，启动它
    if (this.connected && !this.pingTimer) {
      this.startPing();
    }
  }
}
