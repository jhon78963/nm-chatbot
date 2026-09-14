import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProductSlug, buildProductUrl, slugifyProductName } from './product-slug.mjs';

test('slugifyProductName normalizes accents and spaces', () => {
  assert.equal(slugifyProductName('Polo Niño Azul'), 'polo-nino-azul');
});

test('buildProductSlug appends id prefix suffix', () => {
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  assert.equal(buildProductSlug('Vestido Floral', id), 'vestido-floral-a1b2c3d4');
});

test('buildProductUrl uses slug not raw uuid', () => {
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const url = buildProductUrl('https://novedadesmaritex.net.pe/', {
    id,
    name: 'Vestido Floral',
  });
  assert.equal(url, 'https://novedadesmaritex.net.pe/producto/vestido-floral-a1b2c3d4');
});
