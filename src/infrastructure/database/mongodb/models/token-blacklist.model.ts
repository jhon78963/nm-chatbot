import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/**
 * Revoked JWT tokens. TTL index removes documents when the token expires.
 */
export interface ITokenBlacklistDocument {
  _id: Types.ObjectId;
  jti: string;
  expiresAt: number;
}

export type TokenBlacklistDocument = HydratedDocument<ITokenBlacklistDocument>;

const tokenBlacklistSchema = new Schema<ITokenBlacklistDocument>(
  {
    jti: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Number, required: true },
  },
  {
    versionKey: false,
    collection: 'token_blacklist',
  },
);

export const TokenBlacklistModel = model<ITokenBlacklistDocument>(
  'TokenBlacklist',
  tokenBlacklistSchema,
);
