/**
 * Socket.IO CORS：禁止开放模式反射任意 Origin + credentials
 */

import { describe, expect, it } from "@dreamer/test";
import { Server } from "../src/mod.ts";

function optionsRequest(origin: string): Request {
  return new Request("http://localhost/socket.io/?EIO=4&transport=polling", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
    },
  });
}

function handshakeRequest(origin?: string): Request {
  const headers = origin ? { Origin: origin } : undefined;
  return new Request("http://localhost/socket.io/?EIO=4&transport=polling", {
    headers,
  });
}

describe("Socket.IO CORS Origin", () => {
  it("开放模式（无 cors.origin）OPTIONS 应返回 * 且无 credentials", async () => {
    const server = new Server({ path: "/socket.io/" });
    const res = await server.handleIncomingRequest(
      optionsRequest("https://evil.example"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("开放模式 origin:'*' 握手不应反射任意 Origin", async () => {
    const server = new Server({
      path: "/socket.io/",
      cors: { origin: "*" },
    });
    const res = await server.handleIncomingRequest(
      handshakeRequest("https://evil.example"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("白名单匹配时应反射 Origin 并默认带 credentials", async () => {
    const server = new Server({
      path: "/socket.io/",
      cors: { origin: ["https://app.example.com"] },
    });
    const res = await server.handleIncomingRequest(
      optionsRequest("https://app.example.com"),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("白名单未匹配时不应设置 Allow-Origin", async () => {
    const server = new Server({
      path: "/socket.io/",
      cors: { origin: ["https://app.example.com"] },
    });
    const res = await server.handleIncomingRequest(
      optionsRequest("https://evil.example"),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("allowCORS:false 时 OPTIONS 不应设置 Allow-Origin", async () => {
    const server = new Server({
      path: "/socket.io/",
      allowCORS: false,
    });
    const res = await server.handleIncomingRequest(
      optionsRequest("https://app.example.com"),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("白名单 credentials:false 时不应带 Allow-Credentials", async () => {
    const server = new Server({
      path: "/socket.io/",
      cors: {
        origin: "https://app.example.com",
        credentials: false,
      },
    });
    const res = await server.handleIncomingRequest(
      optionsRequest("https://app.example.com"),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});
