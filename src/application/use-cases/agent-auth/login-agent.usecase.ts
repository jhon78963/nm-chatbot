import bcrypt from 'bcryptjs';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { signAgentToken } from '../../services/agent-token.service.js';

export interface LoginAgentInput {
  username: string;
  password: string;
}

export interface LoginAgentOutput {
  token: string;
  agent: {
    id: string;
    name: string;
    username: string;
    email: string;
    role: AgentRole;
  };
}

export class LoginAgentUseCase {
  constructor(private readonly agentRepo: AgentRepository) {}

  async execute(input: LoginAgentInput): Promise<LoginAgentOutput> {
    const username = input.username.toLowerCase().trim();

    const agent = await this.agentRepo.findByUsername(username);
    if (!agent) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    if (agent.status !== 'Active') {
      throw new UnauthorizedError('Cuenta inactiva. Contacte al administrador');
    }

    const passwordHash = await this.agentRepo.getPasswordHash(agent.id);
    if (!passwordHash) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(input.password, passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    await this.agentRepo.updateLastLogin(agent.id);

    const token = signAgentToken(agent);

    return {
      token,
      agent: {
        id: agent.id,
        name: agent.name,
        username: agent.username ?? username,
        email: agent.email,
        role: agent.role,
      },
    };
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
