/**
 * migrate-conversation-handoff-fields.mjs
 * Backfills human-handoff fields on existing conversations.
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB_NAME=uprit-db node deploy/migrate-conversation-handoff-fields.mjs
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chatbot_uprit';

if (!uri) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);

  const result = await db.collection('conversations').updateMany(
    { mode: { $exists: false } },
    {
      $set: {
        mode: 'bot',
        assignedAgentId: null,
        handoffAt: null,
        handoffBy: null,
        lastUserMessageAt: null,
        lastAgentMessageAt: null,
        unreadCountAgent: 0,
      },
    },
  );

  console.log(`Updated ${result.modifiedCount} conversation(s) with handoff defaults`);

  const humanCandidates = await db.collection('conversations').countDocuments({
    handoffState: 'confirmed',
    status: 'closed',
    mode: 'bot',
  });
  if (humanCandidates > 0) {
    console.warn(
      `Note: ${humanCandidates} conversation(s) have handoffState=confirmed and status=closed — review manually if leads should stay in human mode.`,
    );
  }
} finally {
  await client.close();
}
