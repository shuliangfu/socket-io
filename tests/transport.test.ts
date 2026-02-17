/**
 * @fileoverview 传输层测试
 * 测试 WebSocket 和 HTTP 长轮询传输层功能
 */

import { describe, expect, it } from "@dreamer/test";
import { EnginePacketType } from "../src/types.ts";
import {
  ClientPollingTransport,
  ClientWebSocketTransport,
} from "../src/client/mod.ts";
import { TransportState } from "../src/client/transport.ts";

describe("传输层", () => {
  describe("ClientPollingTransport", () => {
    it("应该创建轮询传输实例", () => {
      const transport = new ClientPollingTransport();
      expect(transport).toBeTruthy();
      expect(transport.getState()).toBe(TransportState.DISCONNECTED);
    });

    it("应该支持事件监听", () => {
      const transport = new ClientPollingTransport();
      let packetReceived = false;

      transport.on((_packet: any) => {
        packetReceived = true;
      });

      // 触发事件
      (transport as any).emit({
        type: EnginePacketType.PING,
      });

      expect(packetReceived).toBe(true);
    });

    it("应该移除事件监听器", () => {
      const transport = new ClientPollingTransport();
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      transport.on(listener);
      transport.off(listener);

      (transport as any).emit({
        type: EnginePacketType.PING,
      });

      expect(callCount).toBe(0);
    });

    it("应该检查连接状态", () => {
      const transport = new ClientPollingTransport();
      expect(transport.isConnected()).toBe(false);
      expect(transport.getState()).toBe(TransportState.DISCONNECTED);
    });
  });

  describe("ClientWebSocketTransport", () => {
    it("应该创建 WebSocket 传输实例", () => {
      const transport = new ClientWebSocketTransport();
      expect(transport).toBeTruthy();
      expect(transport.getState()).toBe(TransportState.DISCONNECTED);
    });

    it("应该支持事件监听", () => {
      const transport = new ClientWebSocketTransport();
      let packetReceived = false;

      transport.on((_packet: any) => {
        packetReceived = true;
      });

      // 触发事件
      (transport as any).emit({
        type: EnginePacketType.PING,
      });

      expect(packetReceived).toBe(true);
    });

    it("应该移除事件监听器", () => {
      const transport = new ClientWebSocketTransport();
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      transport.on(listener);
      transport.off(listener);

      (transport as any).emit({
        type: EnginePacketType.PING,
      });

      expect(callCount).toBe(0);
    });

    it("应该检查连接状态", () => {
      const transport = new ClientWebSocketTransport();
      expect(transport.isConnected()).toBe(false);
      expect(transport.getState()).toBe(TransportState.DISCONNECTED);
    });
  });
});
