import { DomainException } from '../exceptions/domain.exception.js';

export enum FunnelIntentionType {
  IDENTIFY_NEED = 'IDENTIFY_NEED',
}

export interface FunnelIntentionProps {
  id: string;
  userId: string;
  title: string;
  type: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain entity representing a funnel intention stored in the funnel_intentions collection.
 */
export class FunnelIntention {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly type: string;
  readonly description: string;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: FunnelIntentionProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.title = props.title;
    this.type = props.type;
    this.description = props.description;
    this.active = props.active;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: FunnelIntentionProps): FunnelIntention {
    if (!props.title.trim()) {
      throw new DomainException('Funnel intention title cannot be empty');
    }
    if (!props.type.trim()) {
      throw new DomainException('Funnel intention type cannot be empty');
    }
    if (!props.description.trim()) {
      throw new DomainException('Funnel intention description cannot be empty');
    }
    return new FunnelIntention(props);
  }

  activate(): FunnelIntention {
    return FunnelIntention.create({ ...this.toProps(), active: true, updatedAt: new Date() });
  }

  deactivate(): FunnelIntention {
    return FunnelIntention.create({ ...this.toProps(), active: false, updatedAt: new Date() });
  }

  toProps(): FunnelIntentionProps {
    return {
      id: this.id,
      userId: this.userId,
      title: this.title,
      type: this.type,
      description: this.description,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
