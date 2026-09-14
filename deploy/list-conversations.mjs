import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chatbot_uprit';

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);

  const convs = await db.collection('conversations')
    .find({ status: 'active' }, { projection: { phoneNumber: 1, systemPrompt: 1, updatedAt: 1 } })
    .toArray();

  console.log(`Active conversations: ${convs.length}`);
  for (const c of convs) {
    const promptLen = (c.systemPrompt || '').length;
    const hasPrograms = (c.systemPrompt || '').includes('PROGRAMAS ACADEMICOS');
    console.log(`  ${c.phoneNumber} | prompt: ${promptLen} chars | hasPrograms: ${hasPrograms} | updated: ${c.updatedAt}`);
  }
} finally {
  await client.close();
}
