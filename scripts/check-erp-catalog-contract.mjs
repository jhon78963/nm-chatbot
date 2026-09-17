import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = join(ROOT, 'prisma', 'catalog.schema.prisma');
const CONTRACT_PATH = join(ROOT, 'contracts', 'erp-catalog.contract.json');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function isScalar(type) {
  return /^(String|Int|Boolean|DateTime|Decimal|Float|Json|Bytes)\??$/.test(type);
}

function normalizeType(type) {
  return type.replace(/[^A-Za-z?]/g, '');
}

function parsePrismaModels(source) {
  const models = {};
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;

  for (const match of stripComments(source).matchAll(modelRegex)) {
    const name = match[1];
    const body = match[2];
    const fields = {};
    const uniques = [];
    let table = null;

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const mapMatch = line.match(/^@@map\("([^"]+)"\)/);
      if (mapMatch) {
        table = mapMatch[1];
        continue;
      }

      const uniqueMatch = line.match(/^@@unique\(\[([^\]]+)\]/);
      if (uniqueMatch) {
        uniques.push(uniqueMatch[1].split(',').map((part) => part.trim().replace(/^"|"$/g, '')));
        continue;
      }

      if (line.startsWith('@@') || line.startsWith('@')) continue;

      const fieldMatch = line.match(/^(\w+)\s+(\S+)/);
      if (!fieldMatch) continue;

      const [, fieldName, fieldType] = fieldMatch;
      if (fieldType.includes('[') || (/^[A-Z]/.test(fieldType) && !isScalar(fieldType))) {
        continue;
      }

      fields[fieldName] = normalizeType(fieldType);
    }

    models[name] = { table, fields, uniques };
  }

  return models;
}

function typesCompatible(contractType, schemaType) {
  return schemaType === contractType || schemaType === contractType.replace('?', '');
}

export function assertCatalogContract() {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const schema = parsePrismaModels(readFileSync(SCHEMA_PATH, 'utf8'));
  const failures = [];

  for (const [modelName, expected] of Object.entries(contract.models)) {
    const actual = schema[modelName];
    if (!actual) {
      failures.push(`Falta modelo ${modelName} en catalog.schema.prisma`);
      continue;
    }

    if (actual.table !== expected.table) {
      failures.push(`${modelName}: @@map esperado "${expected.table}", actual "${actual.table}"`);
    }

    for (const [field, type] of Object.entries(expected.fields)) {
      const actualType = actual.fields[field];
      if (!actualType) {
        failures.push(`${modelName}.${field} no existe en catalog.schema.prisma`);
        continue;
      }
      if (!typesCompatible(type, actualType)) {
        failures.push(`${modelName}.${field}: contrato ${type}, schema ${actualType}`);
      }
    }
  }

  if (failures.length) {
    throw new Error(`Contrato catálogo ERP incumplido:\n- ${failures.join('\n- ')}`);
  }
}

test('catalog.schema.prisma cumple el contrato ERP', () => {
  assert.doesNotThrow(() => assertCatalogContract());
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  assertCatalogContract();
  console.log('OK: catalog.schema.prisma cumple contracts/erp-catalog.contract.json');
}
