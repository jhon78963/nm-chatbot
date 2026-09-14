/**
 * Base data initialization script.
 * Run: node --env-file=.env dist/infrastructure/database/mongodb/seeders/run-seeders.js
 */
import { connectMongoDB, disconnectMongoDB } from '../connection.js';
import { FunnelIntentionMongoRepository } from '../repositories/funnel-intention.mongo-repository.js';
import { seedFunnelIntentions } from './funnel-intentions.seeder.js';
import { logger } from '../../../shared/logger.js';

async function runSeeders(): Promise<void> {
  logger.info('[Seeder] Starting seeders...');

  await connectMongoDB({
    uri: process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/chatbot_uprit',
    dbName: process.env['MONGODB_DB_NAME'] ?? 'chatbot_uprit',
  });

  const funnelIntentionRepo = new FunnelIntentionMongoRepository();
  await seedFunnelIntentions(funnelIntentionRepo);
  logger.info('[Seeder] Base funnel intentions synchronized');

  await disconnectMongoDB();
  logger.info('[Seeder] Completed.');
}

runSeeders().catch((err: unknown) => {
  logger.error('[Seeder] Fatal error', { error: err });
  process.exit(1);
});
