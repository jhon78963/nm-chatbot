import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI ?? '';
const dbName = process.env.MONGODB_DB_NAME ?? 'chatbot_uprit';

await mongoose.connect(uri, { dbName });
const db = mongoose.connection.db;
const agents = await db.collection('agents').find({}).limit(10).toArray();
console.log('db:', dbName, 'agents:', agents.length);
for (const a of agents) {
  console.log(JSON.stringify({ id: a.id, name: a.name, email: a.email, status: a.status, username: a.username }));
}
await mongoose.disconnect();
