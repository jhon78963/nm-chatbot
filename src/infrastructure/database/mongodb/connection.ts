import mongoose from 'mongoose';
import { logger } from '../../shared/logger.js';

export interface MongoConfig {
  uri: string;
  dbName: string;
  maxPoolSize?: number;
  minPoolSize?: number;
}

/**
 * Connects to MongoDB (local or Atlas).
 */
export async function connectMongoDB(config: MongoConfig): Promise<void> {
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
  await mongoose.disconnect();
  logger.info('[MongoDB] Connection closed successfully');
}
