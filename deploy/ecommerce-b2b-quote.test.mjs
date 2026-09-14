import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildB2bQuoteHandoffPrompt,
  parseB2bQuoteMessage,
} from '../dist/application/services/ecommerce-b2b-quote.service.js';

test('parseB2bQuoteMessage detects NM-B2B ref token', () => {
  const intent = parseB2bQuoteMessage(
    [
      'Hola Malu, solicito cotización mayorista:',
      '',
      'Referencia: B2B-20260909-1234',
      'Negocio: Boutique La Esperanza',
      '',
      '[NM-B2B:source=web;ref=B2B-20260909-1234;city=trujillo]',
    ].join('\n'),
  );

  assert.ok(intent);
  assert.equal(intent.quoteNumber, 'B2B-20260909-1234');
  assert.equal(intent.businessName, 'Boutique La Esperanza');
  assert.equal(intent.city, 'trujillo');
});

test('parseB2bQuoteMessage ignores generic retail questions', () => {
  assert.equal(parseB2bQuoteMessage('¿Cuánto cuesta el vestido floral?'), null);
});

test('buildB2bQuoteHandoffPrompt includes business name', () => {
  const prompt = buildB2bQuoteHandoffPrompt({
    quoteNumber: 'B2B-20260909-1234',
    businessName: 'Mi Bazar',
    city: 'lima',
  });

  assert.match(prompt, /Mi Bazar/);
  assert.match(prompt, /B2B-20260909-1234/);
});
