import { Message } from './message.entity.js';

export type ConversationStatus = 'active' | 'idle' | 'closed';
export type HandoffState = 'none' | 'pending' | 'confirmed';
export type ConversationMode = 'bot' | 'human';
export type HandoffBy = 'user' | 'bot' | 'agent' | 'system';

export interface ConversationMetaData {
  filterType: string | null;
  filterValue: string | string[];
}

export interface ConversationProps {
  id: string;
  userId: string;
  phoneNumber: string;
  status: ConversationStatus;
  messages: Message[];
  systemPrompt?: string;
  mode: ConversationMode;
  handoffState: HandoffState;
  consecutiveHandoffs: number;
  assignedAgentId: string | null;
  handoffAt: Date | null;
  handoffBy: HandoffBy | null;
  lastUserMessageAt: Date | null;
  lastAgentMessageAt: Date | null;
  unreadCountAgent: number;
  careerId: string | null;
  metaData: ConversationMetaData | null;
  currentProgramName: string | null;
  labels: string[];
  pinned: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Conversation {
  readonly id: string;
  readonly userId: string;
  readonly phoneNumber: string;
  readonly status: ConversationStatus;
  readonly messages: ReadonlyArray<Message>;
  readonly systemPrompt: string | undefined;
  readonly mode: ConversationMode;
  readonly handoffState: HandoffState;
  readonly consecutiveHandoffs: number;
  readonly assignedAgentId: string | null;
  readonly handoffAt: Date | null;
  readonly handoffBy: HandoffBy | null;
  readonly lastUserMessageAt: Date | null;
  readonly lastAgentMessageAt: Date | null;
  readonly unreadCountAgent: number;
  readonly careerId: string | null;
  readonly metaData: ConversationMetaData | null;
  readonly currentProgramName: string | null;
  readonly labels: string[];
  readonly pinned: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ConversationProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.phoneNumber = props.phoneNumber;
    this.status = props.status;
    this.messages = props.messages;
    this.systemPrompt = props.systemPrompt;
    this.mode = props.mode;
    this.handoffState = props.handoffState;
    this.consecutiveHandoffs = props.consecutiveHandoffs;
    this.assignedAgentId = props.assignedAgentId;
    this.handoffAt = props.handoffAt;
    this.handoffBy = props.handoffBy;
    this.lastUserMessageAt = props.lastUserMessageAt;
    this.lastAgentMessageAt = props.lastAgentMessageAt;
    this.unreadCountAgent = props.unreadCountAgent;
    this.careerId = props.careerId;
    this.metaData = props.metaData;
    this.currentProgramName = props.currentProgramName;
    this.labels = props.labels;
    this.pinned = props.pinned;
    this.archivedAt = props.archivedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: ConversationProps): Conversation {
    return new Conversation(props);
  }

  addMessage(message: Message): Conversation {
    return Conversation.create({
      ...this.toProps(),
      messages: [...this.messages, message],
      updatedAt: new Date(),
    });
  }

  close(): Conversation {
    return Conversation.create({
      ...this.toProps(),
      status: 'closed',
      updatedAt: new Date(),
    });
  }

  withHandoffState(state: HandoffState): Conversation {
    return Conversation.create({
      ...this.toProps(),
      handoffState: state,
      updatedAt: new Date(),
    });
  }

  incrementHandoffs(): Conversation {
    return Conversation.create({
      ...this.toProps(),
      consecutiveHandoffs: this.consecutiveHandoffs + 1,
      updatedAt: new Date(),
    });
  }

  resetHandoffs(): Conversation {
    return Conversation.create({
      ...this.toProps(),
      consecutiveHandoffs: 0,
      handoffState: 'none',
      updatedAt: new Date(),
    });
  }

  withIntentContext(careerId: string | null, metaData: ConversationMetaData | null, programName: string | null): Conversation {
    return Conversation.create({
      ...this.toProps(),
      careerId,
      metaData,
      currentProgramName: programName,
      updatedAt: new Date(),
    });
  }

  withHumanHandoff(agentId: string | null, by: HandoffBy): Conversation {
    return Conversation.create({
      ...this.toProps(),
      mode: 'human',
      assignedAgentId: agentId,
      handoffAt: new Date(),
      handoffBy: by,
      handoffState: 'confirmed',
      status: 'active',
      updatedAt: new Date(),
    });
  }

  withBotMode(): Conversation {
    return Conversation.create({
      ...this.toProps(),
      mode: 'bot',
      assignedAgentId: null,
      handoffAt: null,
      handoffBy: null,
      handoffState: 'none',
      unreadCountAgent: 0,
      updatedAt: new Date(),
    });
  }

  withLastUserMessageAt(at: Date): Conversation {
    return Conversation.create({
      ...this.toProps(),
      lastUserMessageAt: at,
      updatedAt: new Date(),
    });
  }

  withLastAgentMessageAt(at: Date): Conversation {
    return Conversation.create({
      ...this.toProps(),
      lastAgentMessageAt: at,
      updatedAt: new Date(),
    });
  }

  incrementUnread(): Conversation {
    return Conversation.create({
      ...this.toProps(),
      unreadCountAgent: this.unreadCountAgent + 1,
      updatedAt: new Date(),
    });
  }

  resetUnread(): Conversation {
    return Conversation.create({
      ...this.toProps(),
      unreadCountAgent: 0,
      updatedAt: new Date(),
    });
  }

  /** Max 5 lowercase slug labels. */
  static readonly MAX_LABELS = 5;

  withLabels(labels: string[]): Conversation {
    const normalized = labels
      .map((l) => l.toLowerCase().trim())
      .filter(Boolean)
      .slice(0, Conversation.MAX_LABELS);
    return Conversation.create({ ...this.toProps(), labels: normalized, updatedAt: new Date() });
  }

  withPinned(pinned: boolean): Conversation {
    return Conversation.create({ ...this.toProps(), pinned, updatedAt: new Date() });
  }

  archive(): Conversation {
    return Conversation.create({ ...this.toProps(), archivedAt: new Date(), updatedAt: new Date() });
  }

  unarchive(): Conversation {
    return Conversation.create({ ...this.toProps(), archivedAt: null, updatedAt: new Date() });
  }

  isArchived(): boolean {
    return this.archivedAt !== null;
  }

  isHumanMode(): boolean {
    return this.mode === 'human';
  }

  isBotMode(): boolean {
    return this.mode === 'bot';
  }

  getLastNMessages(n: number): ReadonlyArray<Message> {
    return this.messages.slice(-n);
  }

  toProps(): ConversationProps {
    return {
      id: this.id,
      userId: this.userId,
      phoneNumber: this.phoneNumber,
      status: this.status,
      messages: [...this.messages],
      ...(this.systemPrompt !== undefined && { systemPrompt: this.systemPrompt }),
      mode: this.mode,
      handoffState: this.handoffState,
      consecutiveHandoffs: this.consecutiveHandoffs,
      assignedAgentId: this.assignedAgentId,
      handoffAt: this.handoffAt,
      handoffBy: this.handoffBy,
      lastUserMessageAt: this.lastUserMessageAt,
      lastAgentMessageAt: this.lastAgentMessageAt,
      unreadCountAgent: this.unreadCountAgent,
      careerId: this.careerId,
      metaData: this.metaData,
      currentProgramName: this.currentProgramName,
      labels: this.labels,
      pinned: this.pinned,
      archivedAt: this.archivedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
