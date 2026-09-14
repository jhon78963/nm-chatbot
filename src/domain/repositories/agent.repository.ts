import type { Agent } from '../entities/agent.entity.js';

/**
 * Persistence port for Agent aggregate roots.
 */
export interface AgentRepository {
  findById(id: string): Promise<Agent | null>;
  findAll(): Promise<Agent[]>;
  findActive(): Promise<Agent[]>;
  findByUserId(userId: string): Promise<Agent[]>;
  findByUsername(username: string): Promise<Agent | null>;
  findByEmail(email: string): Promise<Agent | null>;
  findNamesByIds(ids: string[]): Promise<Map<string, string>>;
  getPasswordHash(agentId: string): Promise<string | null>;
  save(agent: Agent): Promise<Agent>;
  delete(id: string): Promise<void>;
  updatePasswordHash(agentId: string, hash: string): Promise<void>;
  updateLastLogin(agentId: string): Promise<void>;
}
