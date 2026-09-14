export interface MessageReceivedEvent {
  readonly type: 'MESSAGE_RECEIVED';
  readonly occurredAt: Date;
  readonly payload: {
    messageId: string;
    conversationId: string;
    userId: string;
    phoneNumber: string;
    content: string;
  };
}

export function createMessageReceivedEvent(
  payload: MessageReceivedEvent['payload'],
): MessageReceivedEvent {
  return {
    type: 'MESSAGE_RECEIVED',
    occurredAt: new Date(),
    payload,
  };
}
