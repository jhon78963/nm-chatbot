import { PhoneNumber } from '../value-objects/phone-number.vo.js';

export interface UserProps {
  id: string;
  phoneNumber: PhoneNumber;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  readonly id: string;
  readonly phoneNumber: PhoneNumber;
  readonly name: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.phoneNumber = props.phoneNumber;
    this.name = props.name;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: UserProps): User {
    return new User(props);
  }

  updateName(name: string): User {
    return User.create({ ...this.toProps(), name, updatedAt: new Date() });
  }

  toProps(): UserProps {
    return {
      id: this.id,
      phoneNumber: this.phoneNumber,
      ...(this.name !== undefined && { name: this.name }),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
