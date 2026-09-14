import { Schema, model, type Document } from 'mongoose';
import type { UserRepository } from '../../../../domain/repositories/user.repository.js';
import { User } from '../../../../domain/entities/user.entity.js';
import { PhoneNumber } from '../../../../domain/value-objects/phone-number.vo.js';

interface UserDocument extends Document<string> {
  phoneNumber: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    _id: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true },
    name: { type: String },
  },
  { timestamps: true, versionKey: false, collection: 'users' },
);

const UserModel = model<UserDocument>('User', userSchema);

export class UserMongoRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id).lean();
    return doc ? this.toDomain(doc) : null;
  }

  async findByPhoneNumber(phoneNumber: PhoneNumber): Promise<User | null> {
    const doc = await UserModel.findOne({ phoneNumber: phoneNumber.value }).lean();
    return doc ? this.toDomain(doc) : null;
  }

  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const docs = await UserModel.find({
      _id: { $in: ids },
      name: { $exists: true, $nin: [null, ''] },
    })
      .select('_id name')
      .lean();

    const map = new Map<string, string>();
    for (const doc of docs) {
      const name = String(doc['name'] ?? '').trim();
      if (name) map.set(String(doc['_id']), name);
    }
    return map;
  }

  async save(user: User): Promise<User> {
    const props = user.toProps();
    await UserModel.findByIdAndUpdate(
      props.id,
      {
        _id: props.id,
        phoneNumber: props.phoneNumber.value,
        name: props.name,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      { upsert: true, new: true },
    );
    return user;
  }

  async delete(id: string): Promise<void> {
    await UserModel.findByIdAndDelete(id);
  }

  private toDomain(doc: Record<string, unknown>): User {
    const name = doc['name'] as string | undefined;
    return User.create({
      id: String(doc['_id']),
      phoneNumber: PhoneNumber.create(doc['phoneNumber'] as string),
      ...(name !== undefined && { name }),
      createdAt: doc['createdAt'] as Date,
      updatedAt: doc['updatedAt'] as Date,
    });
  }
}
