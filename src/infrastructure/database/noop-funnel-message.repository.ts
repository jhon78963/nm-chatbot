/** No-op funnel message persistence when MongoDB is not configured (NM Postgres-only mode). */
export class NoOpFunnelMessageRepository {
  async saveUserMessage(_params: {
    funnelUserId: string;
    text: string;
    isAnswered?: boolean;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<void> {
    // no-op
  }

  async saveBotMessage(_params: { funnelUserId: string; text: string }): Promise<void> {
    // no-op
  }

  async saveAgentMessage(_params: {
    funnelUserId: string;
    text: string;
    agentId: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<void> {
    // no-op
  }

  async markLastUserMessageAnswered(_funnelUserId: string): Promise<void> {
    // no-op
  }
}
