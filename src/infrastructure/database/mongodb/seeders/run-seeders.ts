/**
 * Base data initialization script (path legado UPRIT).
 * NM producción no usa Mongo: requiere CHATBOT_MONGO_ENABLED=true y MONGODB_URI.
 */
import { connectMongoDB, disconnectMongoDB } from '../connection.js';
import { FunnelIntentionMongoRepository } from '../repositories/funnel-intention.mongo-repository.js';
import { seedFunnelIntentions } from './funnel-intentions.seeder.js';
import { logger } from '../../../shared/logger.js';

async function runSeeders(): Promise<void> {
  const uri = process.env['MONGODB_URI']?.trim();
  const dbName = process.env['MONGODB_DB_NAME']?.trim();

  logger.info('[Seeder] Starting Mongo seeders (opt-in UPRIT path)...');

  await connectMongoDB({
    uri: uri ?? '',
    dbName: dbName ?? '',
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
