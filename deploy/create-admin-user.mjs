#!/usr/bin/env node
/**
 * Creates (or updates) an admin user for the admissions panel.
 *
 * Usage (from repo root):
 *   node --env-file=.env deploy/create-admin-user.mjs
 *
 * Optional env vars:
 *   ADMIN_USERNAME=admin
 *   ADMIN_PASSWORD=YourSecurePass123!
 *   ADMIN_NAME="Admin UPRIT"
 *   ADMIN_EMAIL=admin@uprit.edu.pe
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/chatbot_uprit';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'chatbot_uprit';
const BCRYPT_ROUNDS = 10;

const USERNAME = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase().trim();
const PASSWORD = process.env.ADMIN_PASSWORD ?? generatePassword();
const NAME = process.env.ADMIN_NAME ?? 'Admin UPRIT';
const EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@uprit.edu.pe').toLowerCase().trim();
const WHATSAPP = process.env.ADMIN_WHATSAPP ?? '+51999999999';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log(`✅ Connected to MongoDB (${MONGODB_DB_NAME})\n`);

const Agent = mongoose.model(
  'Agent',
  new mongoose.Schema({}, { collection: 'agents', strict: false }),
);

const existing = await Agent.findOne({ username: USERNAME }).lean();

const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

if (existing) {
  await Agent.updateOne(
    { _id: existing._id },
    {
      $set: {
        role: 'admin',
        status: 'Active',
        passwordHash,
        name: NAME,
      },
    },
  );
  console.log(`✅ Usuario "${USERNAME}" actualizado a rol admin`);
} else {
  const id = randomUUID();
  await Agent.create({
    id,
    name: NAME,
    email: EMAIL,
    whatsapp: WHATSAPP,
    status: 'Active',
    userId: randomUUID(),
    username: USERNAME,
    passwordHash,
    role: 'admin',
    lastLoginAt: null,
  });
  console.log(`✅ Usuario admin "${USERNAME}" creado`);
}

console.log('\n─────────────────────────────────────────');
console.log('CREDENCIALES ADMIN (compartir de forma segura):');
console.log('─────────────────────────────────────────');
console.log(`  Usuario: ${USERNAME}`);
console.log(`  Password: ${PASSWORD}`);
console.log('\n⚠️  Cambia la contraseña tras el primer login si usaste la generada automáticamente.');

await mongoose.disconnect();
console.log('\nDone.');

function generatePassword() {
  return randomBytes(8).toString('base64url').slice(0, 12) + '!A1';
}
