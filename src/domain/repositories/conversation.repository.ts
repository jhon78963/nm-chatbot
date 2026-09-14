import type { Conversation } from '../entities/conversation.entity.js';
import type { InboxQueryFilters } from '../types/inbox-query-filters.js';

export interface InboxPagination {
  limit: number;
  offset: number;
  filters?: InboxQueryFilters;
}

export interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findActiveByPhoneNumber(phoneNumber: string): Promise<Conversation | null>;
  findByUserId(userId: string): Promise<Conversation[]>;
  /** Returns paginated human-mode conversations assigned to the given agent (no messages loaded). */
  findHumanByAgentId(agentId: string, opts: InboxPagination): Promise<Conversation[]>;
  countHumanByAgentId(agentId: string, filters?: InboxQueryFilters): Promise<number>;
  /** Bot-mode conversations with recent activity (for agent sales review). */
  findBotModeForInbox(opts: { since: Date } & InboxPagination): Promise<Conversation[]>;
  countBotModeForInbox(since: Date, filters?: InboxQueryFilters): Promise<number>;
  /** Admin: active conversations with recent activity (when inbox filters are applied). */
  findAdminInbox(opts: { since: Date } & InboxPagination): Promise<Conversation[]>;
  countAdminInbox(since: Date, filters?: InboxQueryFilters): Promise<number>;
  /** Latest conversation per phone (prefers active, then most recently updated). */
  findLatestByPhoneNumbers(phoneNumbers: string[]): Promise<Map<string, Conversation>>;
  save(conversation: Conversation): Promise<Conversation>;
  delete(id: string): Promise<void>;
}
