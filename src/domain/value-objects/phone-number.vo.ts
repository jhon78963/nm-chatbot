import { DomainException } from '../exceptions/domain.exception.js';

/**
 * Immutable value object representing a phone number in E.164 format.
 */
export class PhoneNumber {
  private static readonly E164_REGEX = /^\+[1-9]\d{7,14}$/;
  /** Peru: country code +51 followed by exactly 9 digits (e.g. +51987654321). */
  private static readonly PERU_E164_REGEX = /^\+51\d{9}$/;

  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(raw: string): PhoneNumber {
    const normalized = raw.trim().replace(/\s+/g, '');
    if (!PhoneNumber.E164_REGEX.test(normalized)) {
      throw new DomainException(
        `Invalid phone number: "${raw}". Must be in E.164 format (e.g. +5215512345678)`,
      );
    }
    return new PhoneNumber(normalized);
  }

  static isPeruvian(raw: string): boolean {
    const normalized = raw.trim().replace(/\s+/g, '');
    return PhoneNumber.PERU_E164_REGEX.test(normalized);
  }

  isPeruvian(): boolean {
    return PhoneNumber.isPeruvian(this.value);
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
