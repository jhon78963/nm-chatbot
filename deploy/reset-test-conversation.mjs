import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chatbot_uprit';
const testPhone = process.argv[2] || '51925762767';

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);

  const result = await db.collection('conversations').updateMany(
    { status: 'active', phoneNumber: testPhone },
    { $set: { status: 'closed', updatedAt: new Date() } }
  );
  console.log(`Closed ${result.modifiedCount} active conversation(s) for ${testPhone}`);
  console.log('Next message from this number will create a new conversation with DB-driven system prompt.');
} finally {
  await client.close();
}
