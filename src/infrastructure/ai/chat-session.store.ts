import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../../application/ports/ai-provider.port.js';

const MAX_MESSAGES_PER_SESSION = 40;
const SESSION_TTL_MS = 30 * 60 * 1000;

interface Session {
  messages: ChatMessage[];
  updatedAt: number;
}

/**
 * Minimal in-memory store for the standalone hybrid-chat REST demo endpoint.
 * NOT meant for multi-instance/production deployments — swap for a persistent
 * ConversationRepository-backed store if this engine is wired into a real channel.
 */
export class ChatSessionStore {
  private readonly sessions = new Map<string, Session>();

  createSession(): string {
    const id = randomUUID();
    this.sessions.set(id, { messages: [], updatedAt: Date.now() });
    return id;
  }

  getHistory(sessionId: string): ChatMessage[] | null {
    this.evictExpired();
    const session = this.sessions.get(sessionId);
    return session ? session.messages : null;
  }

  appendMessage(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.messages.push(message);
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages.splice(0, session.messages.length - MAX_MESSAGES_PER_SESSION);
    }
    session.updatedAt = Date.now();
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
