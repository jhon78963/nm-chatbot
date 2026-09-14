import { randomUUID } from 'node:crypto';

/**
 * Unique message identifier wrapping a UUID v4.
 */
export class MessageId {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static generate(): MessageId {
    return new MessageId(randomUUID());
  }

  static from(value: string): MessageId {
    if (!value?.trim()) {
      throw new Error('MessageId cannot be empty');
    }
    return new MessageId(value.trim());
  }

  equals(other: MessageId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
