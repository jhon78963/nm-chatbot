import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import { Agent, type AgentRole } from '../../../domain/entities/agent.entity.js';
import { signAgentToken } from '../../services/agent-token.service.js';
import { UnauthorizedError } from './login-agent.usecase.js';

const CHATBOT_ERP_ROLES = new Set(['Admin', 'Super Admin']);

interface ErpJwtPayload extends jwt.JwtPayload {
  sub: string;
  username: string;
  tenantId?: string;
  warehouseId?: string;
  roles?: string[];
  enabledPackages?: string[];
  exp?: number;
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

    const isSuperAdmin = roles.includes('Super Admin');
    const packages = payload.enabledPackages ?? [];
    if (!isSuperAdmin && !packages.includes('CHATBOT')) {
      throw new UnauthorizedError(
        'Este cliente no tiene el paquete Chatbot. Pídele a Super Admin que lo active e Integraciones.',
      );
    }

    const username = payload.username?.toLowerCase().trim();
    if (!username) {
      throw new UnauthorizedError('Token ERP inválido');
    }

    let agent = await this.resolveAgentByUserId(payload.sub);
    if (!agent) {
      agent = await this.provisionAgent(payload, username, roles);
    }

    if (agent.status !== 'Active') {
      throw new UnauthorizedError('Cuenta de agente inactiva. Contacte al administrador');
    }

    await this.agentRepo.updateLastLogin(agent.id);

    const expiresIn = resolveChatbotTokenTtl(payload.exp);
    const token = payload.tenantId
      ? signAgentToken(agent, expiresIn, payload.tenantId)
      : signAgentToken(agent, expiresIn);
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

  private async provisionAgent(
    payload: ErpJwtPayload,
    username: string,
    roles: string[],
  ): Promise<Agent> {
    const tenantSuffix = (payload.tenantId ?? randomUUID()).replace(/-/g, '').slice(0, 8);
    const scopedUsername = `${username}.${tenantSuffix}`.toLowerCase();
    const now = new Date();
    const agent = Agent.create({
      id: randomUUID(),
      name: payload.username,
      email: `${scopedUsername}@chatbot.local`,
      whatsapp: '+51900000000',
      status: 'Active',
      userId: payload.sub,
      username: scopedUsername,
      lastLoginAt: now,
      role: roles.includes('Super Admin') || roles.includes('Admin') ? 'admin' : 'agent',
      createdAt: now,
      updatedAt: now,
    });
    return this.agentRepo.save(agent);
  }
}

function resolveChatbotTokenTtl(erpExp?: number): string | number {
  if (typeof erpExp === 'number') {
    const remaining = erpExp - Math.floor(Date.now() / 1000);
    if (remaining > 0) return remaining;
  }

  return process.env['JWT_EXPIRES_IN'] ?? '15m';
}
