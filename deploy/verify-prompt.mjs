import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const r = await client.db(process.env.MONGODB_DB_NAME).collection('conversations')
  .findOne({ status: 'active' }, { projection: { systemPrompt: 1, phoneNumber: 1 } });

const p = r.systemPrompt || '';
console.log(`Phone: ${r.phoneNumber}`);
console.log(`Prompt chars: ${p.length}`);
console.log(`Has Costos: ${p.includes('Costos:')}`);
console.log(`Has Brochure: ${p.includes('Brochure:')}`);
console.log(`Has Inscripcion: ${p.includes('Inscripci')}`);
console.log(`Has WhatsApp admisiones: ${p.includes('WhatsApp admisiones:')}`);
console.log(`Programs listed: ${(p.match(/\[.*?\]/g) || []).length}`);
console.log('\n--- first program snippet ---');
const start = p.indexOf('[');
console.log(p.slice(start, start + 500));
await client.close();
