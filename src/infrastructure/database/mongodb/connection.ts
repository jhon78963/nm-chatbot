import { logger } from '../../shared/logger.js';
import { assertMongoPathEnabled } from './mongo-path.js';

export { assertMongoPathEnabled, isChatbotMongoPathEnabled } from './mongo-path.js';

export interface MongoConfig {
  uri: string;
  dbName: string;
  maxPoolSize?: number;
  minPoolSize?: number;
}

/**
 * Connects to MongoDB (local or Atlas).
 * Requiere CHATBOT_MONGO_ENABLED=true — no hay fallback a chatbot_uprit.
 */
export async function connectMongoDB(config: MongoConfig): Promise<void> {
  assertMongoPathEnabled();

  if (!config.uri?.trim() || !config.dbName?.trim()) {
    throw new Error('MONGODB_URI y MONGODB_DB_NAME son obligatorios cuando CHATBOT_MONGO_ENABLED=true');
  }

  const mongoose = (await import('mongoose')).default;
  const isAtlas = config.uri.startsWith('mongodb+srv://');

  mongoose.connection.on('connected', () =>
    logger.info(`[MongoDB] Connected to "${config.dbName}" ${isAtlas ? '(Atlas)' : '(local)'}`),
  );
  mongoose.connection.on('error', (err) =>
    logger.error('[MongoDB] Connection error', { error: err }),
  );
  mongoose.connection.on('disconnected', () =>
    logger.warn('[MongoDB] Disconnected'),
  );

  await mongoose.connect(config.uri, {
    dbName: config.dbName,
    maxPoolSize: config.maxPoolSize ?? 10,
    minPoolSize: config.minPoolSize ?? 2,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
    writeConcern: { w: 'majority' },
  });
}

export async function disconnectMongoDB(): Promise<void> {
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  logger.info('[MongoDB] Connection closed successfully');
}
