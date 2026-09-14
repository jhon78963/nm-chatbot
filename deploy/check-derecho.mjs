import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB_NAME);

// Find Derecho program
const prog = await db.collection('programs').findOne(
  { name: /derecho/i, status: 'active' },
  { projection: { name: 1, brochureUrl: 1, applicationFormUrl: 1, whatsappContact: 1, costs: 1, summary: 1, iaInformation: 1, admissionRequirements: 1, _id: 0 } }
);

if (!prog) {
  console.log('Derecho NOT found as active program');
  const all = await db.collection('programs').find({}, { projection: { name: 1, status: 1, _id: 0 } }).toArray();
  console.log('All programs:', all.map(p => `${p.name} (${p.status})`).join('\n'));
} else {
  console.log('Found:', prog.name);
  console.log('brochureUrl:', prog.brochureUrl || '(empty)');
  console.log('applicationFormUrl:', prog.applicationFormUrl || '(empty)');
  console.log('whatsappContact:', prog.whatsappContact || '(empty)');
  console.log('costs:', JSON.stringify(prog.costs));
  console.log('iaInformation:', (prog.iaInformation || '').slice(0, 200));
}

await client.close();
