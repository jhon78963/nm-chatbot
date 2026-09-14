import jwt from 'jsonwebtoken';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { signAgentToken } from '../../services/agent-token.service.js';
import { UnauthorizedError } from './login-agent.usecase.js';

const CHATBOT_ERP_ROLES = new Set(['Admin', 'Super Admin']);

interface ErpJwtPayload extends jwt.JwtPayload {
  sub: string;
  username: string;
  tenantId?: string;
  warehouseId?: string;
  roles?: string[];
}

export interface SsoErpLoginInput {
  erpAccessToken: string;
}

export interface SsoErpLoginOutput {
  token: string;
  agent: {
    id: string;
    name: string;
    username: string;
    email: string;
    role: AgentRole;
  };
}

export class SsoErpLoginUseCase {
  constructor(private readonly agentRepo: AgentRepository) {}

  async execute(input: SsoErpLoginInput): Promise<SsoErpLoginOutput> {
    const erpSecret = process.env['ERP_JWT_SECRET'];
    if (!erpSecret) {
      throw new Error('ERP_JWT_SECRET not configured');
    }

    let payload: ErpJwtPayload;
    try {
      payload = jwt.verify(input.erpAccessToken, erpSecret) as ErpJwtPayload;
    } catch {
      throw new UnauthorizedError('Sesión ERP inválida o expirada');
    }

    const roles = payload.roles ?? [];
    if (!roles.some((role) => CHATBOT_ERP_ROLES.has(role))) {
      throw new UnauthorizedError('No tienes acceso al panel de chatbot');
    }

    const username = payload.username?.toLowerCase().trim();
    if (!username) {
      throw new UnauthorizedError('Token ERP inválido');
    }

    let agent =
      (await this.agentRepo.findByUsername(username)) ??
      (await this.resolveAgentByUserId(payload.sub));

    if (!agent) {
      throw new UnauthorizedError(
        'No hay un agente de chatbot vinculado a tu usuario ERP. Contacte al administrador.',
      );
    }

    if (agent.status !== 'Active') {
      throw new UnauthorizedError('Cuenta de agente inactiva. Contacte al administrador');
    }

    await this.agentRepo.updateLastLogin(agent.id);

    const expiresIn = resolveChatbotTokenTtl(payload.exp);
    const token = signAgentToken(agent, expiresIn);
    const agentUsername = agent.username ?? username;

    return {
      token,
      agent: {
        id: agent.id,
        name: agent.name,
        username: agentUsername,
        email: agent.email,
        role: agent.role,
      },
    };
  }

  private async resolveAgentByUserId(userId: string) {
    const agents = await this.agentRepo.findByUserId(userId);
    return agents[0] ?? null;
  }
}

function resolveChatbotTokenTtl(erpExp?: number): string | number {
  if (typeof erpExp === 'number') {
    const remaining = erpExp - Math.floor(Date.now() / 1000);
    if (remaining > 0) return remaining;
  }

  return process.env['JWT_EXPIRES_IN'] ?? '15m';
}
