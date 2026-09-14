import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chatbot_uprit';

if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);

  const total = await db.collection('programs').countDocuments({});
  const active = await db.collection('programs').countDocuments({ status: 'active' });
  console.log(`Programs in DB: ${total} total, ${active} active`);

  if (active > 0) {
    const sample = await db.collection('programs').findOne({ status: 'active' });
    console.log(`Sample: ${sample.name}`);
    console.log(`  hasIaInformation: ${!!(sample.iaInformation && sample.iaInformation.length > 10)}`);
    console.log(`  iaInformation length: ${(sample.iaInformation || '').length}`);
    console.log(`  faq entries: ${(sample.faq || []).length}`);
    console.log(`  admissionRequirements: ${(sample.admissionRequirements || []).length}`);
    console.log(`  sellingPoints: ${(sample.sellingPoints || []).length}`);
  } else {
    console.log('WARNING: No active programs found. Bot will use fallback prompt.');
    console.log('To fix: set status="active" on programs and fill the iaInformation field.');
  }

  const conversations = await db.collection('conversations').countDocuments({ status: 'active' });
  console.log(`\nActive conversations: ${conversations}`);

} finally {
  await client.close();
}
