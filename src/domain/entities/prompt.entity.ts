import { DomainException } from '../exceptions/domain.exception.js';

const HBS_EXPRESSION_REGEX = /\{\{.+?\}\}/;

export interface PromptVariableEntry {
  source: string;
  path: string;
  collectionId: string;
  type: string;
}

export interface PromptProps {
  id: string;
  title: string;
  active: boolean;
  funnelId: string;
  intentionId: string;
  template: string;
  variables: PromptVariableEntry[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain entity representing a Handlebars prompt template linked to a funnel intention.
 */
export class Prompt {
  readonly id: string;
  readonly title: string;
  readonly active: boolean;
  readonly funnelId: string;
  readonly intentionId: string;
  readonly template: string;
  readonly variables: ReadonlyArray<PromptVariableEntry>;
  readonly userId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: PromptProps) {
    this.id = props.id;
    this.title = props.title;
    this.active = props.active;
    this.funnelId = props.funnelId;
    this.intentionId = props.intentionId;
    this.template = props.template;
    this.variables = props.variables;
    this.userId = props.userId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: PromptProps): Prompt {
    if (!props.template.trim()) {
      throw new DomainException('Prompt template cannot be empty');
    }
    if (!props.intentionId.trim()) {
      throw new DomainException('Prompt must be linked to a funnel intention');
    }
    if (!props.funnelId.trim()) {
      throw new DomainException('Prompt must be linked to a funnel');
    }
    return new Prompt(props);
  }

  usesHandlebars(): boolean {
    return HBS_EXPRESSION_REGEX.test(this.template);
  }

  activate(): Prompt {
    return Prompt.create({ ...this.toProps(), active: true, updatedAt: new Date() });
  }

  deactivate(): Prompt {
    return Prompt.create({ ...this.toProps(), active: false, updatedAt: new Date() });
  }

  toProps(): PromptProps {
    return {
      id: this.id,
      title: this.title,
      active: this.active,
      funnelId: this.funnelId,
      intentionId: this.intentionId,
      template: this.template,
      variables: this.variables.map((item) => ({ ...item })),
      userId: this.userId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
