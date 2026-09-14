export interface ConversationStartedEvent {
  readonly type: 'CONVERSATION_STARTED';
  readonly occurredAt: Date;
  readonly payload: {
    conversationId: string;
    userId: string;
    phoneNumber: string;
  };
}

export function createConversationStartedEvent(
  payload: ConversationStartedEvent['payload'],
): ConversationStartedEvent {
  return {
    type: 'CONVERSATION_STARTED',
    occurredAt: new Date(),
    payload,
  };
}
