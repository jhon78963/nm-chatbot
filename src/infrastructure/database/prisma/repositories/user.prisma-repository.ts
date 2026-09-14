import type { UserRepository } from '../../../../domain/repositories/user.repository.js';
import { User } from '../../../../domain/entities/user.entity.js';
import { PhoneNumber } from '../../../../domain/value-objects/phone-number.vo.js';
import { getPrismaClient } from '../prisma.client.js';

/** WhatsApp leads persisted in chat_funnel_users (shared with funnel panel). */
export class UserPrismaRepository implements UserRepository {
  private normalizePhone(value: string): string {
    return value.trim().replace(/^\+/, '');
  }

  async findById(id: string): Promise<User | null> {
    const doc = await getPrismaClient().chatFunnelUser.findUnique({ where: { id } });
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByPhoneNumber(phoneNumber: PhoneNumber): Promise<User | null> {
    const normalized = this.normalizePhone(phoneNumber.value);
    const doc = await getPrismaClient().chatFunnelUser.findFirst({
      where: {
        OR: [{ senderId: normalized }, { senderId: `+${normalized}` }],
      },
    });
    if (!doc) return null;
    return this.toDomain(doc, phoneNumber);
  }

  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const docs = await getPrismaClient().chatFunnelUser.findMany({
      where: {
        id: { in: ids },
        name: { not: null },
      },
      select: { id: true, name: true },
    });

    const map = new Map<string, string>();
    for (const doc of docs) {
      const name = String(doc.name ?? '').trim();
      if (name) map.set(doc.id, name);
    }
    return map;
  }

  async save(user: User): Promise<User> {
    const props = user.toProps();
    const normalized = this.normalizePhone(props.phoneNumber.value);

    await getPrismaClient().chatFunnelUser.upsert({
      where: { senderId: normalized },
      create: {
        id: props.id,
        senderId: normalized,
        name: props.name ?? null,
        platform: 'whatsapp',
      },
      update: {
        name: props.name ?? null,
      },
    });

    return user;
  }

  async delete(id: string): Promise<void> {
    await getPrismaClient().chatFunnelUser.delete({ where: { id } }).catch(() => undefined);
  }

  private toDomain(
    doc: {
      id: string;
      senderId: string;
      name: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    phoneOverride?: PhoneNumber,
  ): User {
    const phone = phoneOverride ?? PhoneNumber.create(
      doc.senderId.startsWith('+') ? doc.senderId : `+${doc.senderId}`,
    );
    const name = doc.name?.trim() || undefined;
    return User.create({
      id: doc.id,
      phoneNumber: phone,
      ...(name !== undefined && { name }),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
