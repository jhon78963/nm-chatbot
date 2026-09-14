export interface SendAiResponseDto {
  conversationId: string;
  systemPromptOverride?: string;
}

export interface SendAiResponseResult {
  messageId: string;
  content: string;
  tokensUsed: number;
}
