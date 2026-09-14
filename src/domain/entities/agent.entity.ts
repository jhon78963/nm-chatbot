import { DomainException } from '../exceptions/domain.exception.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export type AgentStatus = 'Active' | 'Inactive';
export type AgentRole = 'agent' | 'admin';

export interface AgentProps {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  status: AgentStatus;
  userId: string;
  username: string | null;
  lastLoginAt: Date | null;
  role: AgentRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain entity representing a human agent who receives handoff notifications.
 * passwordHash is intentionally excluded from props to avoid accidental exposure.
 */
export class Agent {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly whatsapp: string;
  readonly status: AgentStatus;
  readonly userId: string;
  readonly username: string | null;
  readonly lastLoginAt: Date | null;
  readonly role: AgentRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AgentProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.whatsapp = props.whatsapp;
    this.status = props.status;
    this.userId = props.userId;
    this.username = props.username ?? null;
    this.lastLoginAt = props.lastLoginAt ?? null;
    this.role = props.role ?? 'agent';
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get isActive(): boolean {
    return this.status === 'Active';
  }

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  static create(props: AgentProps): Agent {
    if (!props.name.trim()) {
      throw new DomainException('Agent name cannot be empty');
    }
    if (!EMAIL_REGEX.test(props.email)) {
      throw new DomainException(`Invalid email: "${props.email}"`);
    }
    if (!E164_REGEX.test(props.whatsapp)) {
      throw new DomainException(
        `Invalid agent WhatsApp number: "${props.whatsapp}". Must be in E.164 format`,
      );
    }
    return new Agent(props);
  }

  deactivate(): Agent {
    return Agent.create({ ...this.toProps(), status: 'Inactive', updatedAt: new Date() });
  }

  activate(): Agent {
    return Agent.create({ ...this.toProps(), status: 'Active', updatedAt: new Date() });
  }

  toProps(): AgentProps {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      whatsapp: this.whatsapp,
      status: this.status,
      userId: this.userId,
      username: this.username,
      lastLoginAt: this.lastLoginAt,
      role: this.role,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
