import type { User } from '../entities/user.entity.js';
import type { PhoneNumber } from '../value-objects/phone-number.vo.js';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByPhoneNumber(phoneNumber: PhoneNumber): Promise<User | null>;
  findNamesByIds(ids: string[]): Promise<Map<string, string>>;
  save(user: User): Promise<User>;
  delete(id: string): Promise<void>;
}
