# Socket.IO Client

Socket.IO client library for browser environments, providing real-time
bidirectional communication.

## Features

- **Transports**: WebSocket and HTTP long polling with automatic fallback
- **Auto reconnect**: Configurable reconnection strategy
- **Events**: connect, disconnect, custom events, `once()`,
  `removeAllListeners()`
- **Namespaces**: Namespace isolation for different use cases
- **Acknowledgments**: Event acknowledgment (ack) support

## Installation

### Deno

```bash
deno add jsr:@dreamer/socket.io/client
```

### Bun

```bash
bunx jsr add @dreamer/socket.io/client
```

## Quick Start

### Basic usage

```typescript
import { Client } from "jsr:@dreamer/socket.io/client";

// Create client
const client = new Client({
  url: "http://localhost:3000",
  namespace: "/",
});

// Connection success
client.on("connect", () => {
  console.log("Connected, Socket ID:", client.getId());

  // Send message
  client.emit("chat-message", {
    text: "Hello, Server!",
  });
});

// Receive message
client.on("chat-response", (data) => {
  console.log("Response:", data);
});

// Disconnect
client.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});

// Connection error
client.on("connect_error", (error) => {
  console.error("Connection error:", error);
});
```

### Events with acknowledgment

```typescript
client.emit("chat-message", { text: "Hello" }, (response) => {
  console.log("Server ack:", response);
});
```

### Custom reconnection strategy

```typescript
const client = new Client({
  url: "http://localhost:3000",
  autoReconnect: true,
  reconnectionDelay: 1000, // Initial delay 1s
  reconnectionDelayMax: 5000, // Max delay 5s
  reconnectionAttempts: 10, // Max 10 attempts
});
```

### Specify transports

```typescript
const client = new Client({
  url: "http://localhost:3000",
  transports: ["websocket", "polling"], // Prefer WebSocket, fallback to polling
});
```

### Using namespaces

```typescript
// Connect to chat namespace
const chatClient = new Client({
  url: "http://localhost:3000",
  namespace: "/chat",
});

chatClient.on("connect", () => {
  chatClient.emit("chat-message", { text: "Hello" });
});
```

### One-time event listeners

```typescript
// Listen to connect once
client.once("connect", () => {
  console.log("First connection succeeded");
});

// Listen to custom event once
client.once("welcome-message", (data) => {
  console.log("Welcome message:", data);
});
```

### Remove event listeners

```typescript
// Remove all listeners for a specific event
client.removeAllListeners("chat-message");

// Remove all listeners for all events
client.removeAllListeners();
```

## API

### Client

Socket.IO client class.

**Constructor**:

```typescript
new Client(options: ClientOptions)
```

**Options**:

- `url: string`: Server URL (required)
- `namespace?: string`: Namespace (default: `"/"`)
- `query?: Record<string, string>`: Query parameters
- `autoConnect?: boolean`: Auto connect (default: `true`)
- `autoReconnect?: boolean`: Auto reconnect (default: `true`)
- `reconnectionDelay?: number`: Reconnection delay in ms (default: `1000`)
- `reconnectionDelayMax?: number`: Max reconnection delay in ms (default:
  `5000`)
- `reconnectionAttempts?: number`: Max reconnection attempts (default:
  `Infinity`)
- `transports?: TransportType[]`: Allowed transports (default:
  `["websocket", "polling"]`)
- `timeout?: number`: Timeout in ms (default: `20000`)

**Methods**:

- `connect(): Promise<void>`: Connect to server
- `disconnect(): void`: Disconnect
- `emit(event: string, data?: any, callback?: Function): void`: Emit event
- `on(event: string, listener: ClientEventListener): void`: Listen to event
- `off(event: string, listener?: ClientEventListener): void`: Remove listener
- `once(event: string, listener: ClientEventListener): void`: Listen once
- `removeAllListeners(event?: string): this`: Remove all listeners (or for given
  event)
- `getId(): string`: Get Socket ID
- `isConnected(): boolean`: Whether connected

**Events**:

- `connect`: Connection succeeded
- `disconnect`: Disconnected
- `connect_error`: Connection error
- `reconnect_failed`: Reconnection failed
- `message`: Generic message event
- Custom events: any event emitted by the server

## Notes

- The client is intended mainly for browser environments.
- Automatic fallback: if WebSocket is unavailable, falls back to HTTP long
  polling.
- Automatic reconnection: reconnects after disconnect.
- Acknowledgments: supports server-side ack callbacks for client events.
