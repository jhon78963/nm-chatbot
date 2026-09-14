/**
 * refresh-system-prompts.mjs
 * Updates systemPrompt on all active conversations using live program data from MongoDB.
 * Run once after deploying the SystemPromptBuilderService feature.
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chatbot_uprit';

const BASE = `Eres el asistente virtual oficial de UPRIT. Responde de manera concisa, amable y profesional en el mismo idioma que el usuario. Usa SOLO texto plano sin markdown (sin **, *, #, listas con guion, ni bloques de codigo) porque el canal es WhatsApp.

REGLAS IMPORTANTES:
- Cuando tengas la URL del brochure de un programa, comparte el enlace directamente como texto plano. Los enlaces se pueden compartir por WhatsApp como texto normal; NO digas que no puedes enviar archivos.
- Cuando tengas costos, brochure, WhatsApp de admisiones o cualquier otro dato especifico del programa en tu contexto, proporcionalo directamente sin redirigir al usuario a otra fuente.
- Solo di que no tienes informacion cuando el dato realmente no este disponible en tu contexto.`;

const MAX_PROMPT_CHARS = 40_000;

function trunc(text, max) {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function formatProgram(p) {
  const lines = [`[${p.name}]`];
  if (p.iaInformation) lines.push(trunc(p.iaInformation, 300));
  else if (p.summary) lines.push(trunc(p.summary, 250));
  if (p.duration) lines.push(`Duración: ${p.duration}`);
  if (p.scheduleDescription) lines.push(trunc(`Horarios: ${p.scheduleDescription}`, 120));

  const activeCosts = (p.costs || []).filter(c => c.bachelorFolderFee > 0 || c.thesisFolderFee > 0);
  if (activeCosts.length) {
    const costStr = activeCosts
      .map(c => `${c.currency}: bachiller S/${c.bachelorFolderFee}, tesis S/${c.thesisFolderFee}`)
      .join(' | ');
    lines.push(`Costos: ${costStr}`);
  }

  if ((p.admissionRequirements || []).length)
    lines.push(`Requisitos: ${p.admissionRequirements.slice(0, 3).join(' | ')}`);
  if (p.brochureUrl) lines.push(`Brochure: ${p.brochureUrl}`);
  if (p.applicationFormUrl) lines.push(`Inscripción: ${p.applicationFormUrl}`);
  if (p.whatsappContact) lines.push(`WhatsApp admisiones: ${p.whatsappContact}`);
  return lines.join('\n');
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);

  const programs = await db.collection('programs').find({ status: 'active' }).toArray();
  console.log(`Loaded ${programs.length} active programs`);

  let systemPrompt;
  if (programs.length === 0) {
    console.warn('No active programs — using base prompt only');
    systemPrompt = BASE;
  } else {
    const blocks = [];
    let totalLen = BASE.length + 60;
    for (const p of programs) {
      const block = formatProgram(p);
      if (totalLen + block.length > MAX_PROMPT_CHARS) break;
      blocks.push(block);
      totalLen += block.length + 6;
    }
    console.log(`Including ${blocks.length} of ${programs.length} programs within ${MAX_PROMPT_CHARS} char limit`);
    const programBlocks = blocks.join('\n---\n');
    systemPrompt = `${BASE}\n\n== PROGRAMAS ACADEMICOS DE UPRIT ==\n\n${programBlocks}`;
  }

  console.log(`Built system prompt: ${systemPrompt.length} chars`);

  const result = await db.collection('conversations').updateMany(
    { status: 'active' },
    { $set: { systemPrompt, updatedAt: new Date() } }
  );
  console.log(`Updated ${result.modifiedCount} active conversation(s)`);

} finally {
  await client.close();
}
