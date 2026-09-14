import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';
import type { RealtimePort, RealtimeEvent } from '../../application/ports/realtime.port.js';
import type { AgentJwtPayload } from '../http/middlewares/authenticate-agent-jwt.middleware.js';
import { logger } from '../shared/logger.js';

const WS_PATH = '/api/v1/ws';

/**
 * WebSocket protocol (JSON text frames) for the admin panel.
 *
 * ## Authentication
 * Connect with JWT query param: `wss://host/api/v1/ws?token=<JWT>`
 * Same secret as `authenticateAgentJwt` (`JWT_SECRET`). Invalid/missing token → HTTP 401.
 *
 * ## Server → Client events
 * | type                | payload |
 * |---------------------|---------|
 * | `connected`         | `{ agentId, username, name, role, heartbeatMs }` |
 * | `pong`              | `{}` — reply to client `ping` |
 * | `ping`              | `{}` — server heartbeat |
 * | `message.new`       | `{ conversationId, message: MessageEventData }` |
 * | `message.status`    | `{ conversationId, messageId, status, deliveredAt?, readAt? }` |
 * | `conversation.read` | `{ conversationId, unreadCountAgent }` |
 * | `typing.start`      | `{ conversationId, agentId, agentName }` |
 * | `typing.stop`       | `{ conversationId, agentId }` |
 *
 * ## Client → Server events
 * | type           | payload |
 * |----------------|---------|
 * | `ping`         | `{}` |
 * | `typing.start` | `{ conversationId }` |
 * | `typing.stop`  | `{ conversationId }` |
 *
 * Note: Meta Cloud API does not send inbound lead typing via standard webhooks.
 *
 * ## Fan-out rules
 * - `mode=bot`:   broadcast to all connected sockets.
 * - `mode=human`: send to assigned agent (all their tabs) + all admin-role sockets.
 * - Implemented via `broadcastToAll`, `sendToAgent`, `broadcastToAdmins` on this adapter.
 *
 * ## Heartbeat
 * - Interval: `WS_HEARTBEAT_MS` env var (default 30 000 ms).
 * - Server sends `{ type: "ping" }` every interval.
 * - Connections with no inbound frame for 2 × heartbeat interval are closed.
 *
 * ## Multi-tab
 * Multiple WebSocket connections per `agentId` are allowed (one per browser tab).
 * Each tab is an independent socket; events are delivered to all open tabs.
 */
export interface WebSocketRealtimeOptions {
  jwtSecret: string;
  heartbeatMs?: number;
}

interface ClientState {
  agentId: string;
  username: string;
  name: string;
  role: string;
  lastActivityAt: number;
}

type InfraOutboundEvent =
  | { type: 'connected'; agentId: string; username: string; name: string; role: string; heartbeatMs: number }
  | { type: 'pong' }
  | { type: 'ping' };

type TypingOutboundEvent =
  | { type: 'typing.start'; conversationId: string; agentId: string; agentName: string }
  | { type: 'typing.stop'; conversationId: string; agentId: string };

type AnyOutboundEvent = InfraOutboundEvent | RealtimeEvent | TypingOutboundEvent;

interface ClientInboundMessage {
  type?: string;
  conversationId?: string;
}

export class WebSocketRealtimeAdapter implements RealtimePort {
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** agentId → open sockets (multiple tabs per agent) */
  private readonly connections = new Map<string, Set<WebSocket>>();
  private readonly clientStates = new WeakMap<WebSocket, ClientState>();
  private readonly heartbeatMs: number;

  constructor(private readonly options: WebSocketRealtimeOptions) {
    this.heartbeatMs = options.heartbeatMs ?? Number(process.env['WS_HEARTBEAT_MS'] ?? 30_000);
  }

  // ─── RealtimePort ──────────────────────────────────────────────────────────

  /**
   * Attach the WebSocket server to the HTTP server and begin accepting connections.
   * Call this after createServer() returns the httpServer.
   */
  start(httpServer: HttpServer): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      if (!this.isWebSocketPath(req.url)) {
        socket.destroy();
        return;
      }

      const token = this.extractToken(req);
      const agent = this.verifyToken(token);
      if (!agent) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.registerConnection(ws, agent);
        this.wss!.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const state = this.clientStates.get(ws);
      if (!state) {
        ws.close(1011, 'Internal error');
        return;
      }

      this.send(ws, {
        type: 'connected',
        agentId: state.agentId,
        username: state.username,
        name: state.name,
        role: state.role,
        heartbeatMs: this.heartbeatMs,
      });

      ws.on('message', (data) => {
        this.touch(ws);
        this.handleClientMessage(ws, data);
      });

      ws.on('close', () => this.unregisterConnection(ws));
      ws.on('error', (err) => {
        logger.warn('[WS] Client error', { agentId: state.agentId, error: err.message });
        this.unregisterConnection(ws);
      });
    });

    this.heartbeatTimer = setInterval(() => this.runHeartbeat(), this.heartbeatMs);
    logger.info('[WS] Realtime server ready', { path: WS_PATH, heartbeatMs: this.heartbeatMs });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const sockets of this.connections.values()) {
      for (const ws of sockets) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.connections.clear();

    await new Promise<void>((resolve) => {
      if (!this.wss) { resolve(); return; }
      this.wss.close(() => resolve());
      this.wss = null;
    });
  }

  getConnectedAgentCount(): number {
    return this.connections.size;
  }

  /** Send event to all open sockets of a specific agent (all browser tabs). */
  sendToAgent(agentId: string, event: RealtimeEvent): void {
    const sockets = this.connections.get(agentId);
    if (!sockets) return;
    const payload = JSON.stringify(event);
    for (const ws of sockets) {
      this.sendRaw(ws, payload);
    }
  }

  /** Send event only to sockets whose JWT role is 'admin'. */
  broadcastToAdmins(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const sockets of this.connections.values()) {
      for (const ws of sockets) {
        const state = this.clientStates.get(ws);
        if (state?.role === 'admin') {
          this.sendRaw(ws, payload);
        }
      }
    }
  }

  /** Broadcast event to every connected socket regardless of role. */
  broadcastToAll(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const sockets of this.connections.values()) {
      for (const ws of sockets) {
        this.sendRaw(ws, payload);
      }
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private isWebSocketPath(url: string | undefined): boolean {
    if (!url) return false;
    try {
      return new URL(url, 'http://localhost').pathname === WS_PATH;
    } catch {
      return url.startsWith(WS_PATH);
    }
  }

  private extractToken(req: IncomingMessage): string | null {
    if (!req.url) return null;
    try {
      return new URL(req.url, 'http://localhost').searchParams.get('token');
    } catch {
      return null;
    }
  }

  private verifyToken(token: string | null): AgentJwtPayload | null {
    if (!token) return null;
    try {
      return jwt.verify(token, this.options.jwtSecret) as AgentJwtPayload;
    } catch {
      return null;
    }
  }

  private registerConnection(ws: WebSocket, agent: AgentJwtPayload): void {
    const agentId = agent.sub;
    const state: ClientState = {
      agentId,
      username: agent.username,
      name: agent.name,
      role: agent.role ?? 'agent',
      lastActivityAt: Date.now(),
    };
    this.clientStates.set(ws, state);

    let sockets = this.connections.get(agentId);
    if (!sockets) {
      sockets = new Set();
      this.connections.set(agentId, sockets);
    }
    sockets.add(ws);

    logger.info('[WS] Agent connected', { agentId, username: agent.username, role: state.role, tabs: sockets.size });
  }

  private unregisterConnection(ws: WebSocket): void {
    const state = this.clientStates.get(ws);
    if (!state) return;

    const sockets = this.connections.get(state.agentId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) this.connections.delete(state.agentId);
    }
    this.clientStates.delete(ws);
    logger.info('[WS] Agent disconnected', { agentId: state.agentId });
  }

  private touch(ws: WebSocket): void {
    const state = this.clientStates.get(ws);
    if (state) state.lastActivityAt = Date.now();
  }

  private handleClientMessage(ws: WebSocket, data: WebSocket.RawData): void {
    let parsed: ClientInboundMessage;
    try {
      parsed = JSON.parse(String(data)) as ClientInboundMessage;
    } catch {
      return;
    }

    if (parsed.type === 'ping') {
      this.send(ws, { type: 'pong' });
      return;
    }

    if (parsed.type === 'pong') {
      return;
    }

    if (
      (parsed.type === 'typing.start' || parsed.type === 'typing.stop') &&
      typeof parsed.conversationId === 'string' &&
      parsed.conversationId.trim()
    ) {
      this.relayTyping(ws, parsed.type, parsed.conversationId.trim());
    }
  }

  /** Retransmit typing events to all other connected agents (same conversationId filter on client). */
  private relayTyping(
    senderWs: WebSocket,
    kind: 'typing.start' | 'typing.stop',
    conversationId: string,
  ): void {
    const sender = this.clientStates.get(senderWs);
    if (!sender) return;

    const event: TypingOutboundEvent =
      kind === 'typing.start'
        ? {
            type: 'typing.start',
            conversationId,
            agentId: sender.agentId,
            agentName: sender.name,
          }
        : { type: 'typing.stop', conversationId, agentId: sender.agentId };

    const payload = JSON.stringify(event);
    for (const sockets of this.connections.values()) {
      for (const ws of sockets) {
        if (ws === senderWs) continue;
        this.sendRaw(ws, payload);
      }
    }
  }

  private runHeartbeat(): void {
    const staleThreshold = this.heartbeatMs * 2;
    const now = Date.now();

    for (const sockets of this.connections.values()) {
      for (const ws of sockets) {
        const state = this.clientStates.get(ws);
        if (!state) continue;

        if (now - state.lastActivityAt > staleThreshold) {
          logger.warn('[WS] Closing stale connection', { agentId: state.agentId });
          ws.close(1000, 'Heartbeat timeout');
          continue;
        }
        this.send(ws, { type: 'ping' });
      }
    }
  }

  private send(ws: WebSocket, event: AnyOutboundEvent): void {
    this.sendRaw(ws, JSON.stringify(event));
  }

  private sendRaw(ws: WebSocket, payload: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
