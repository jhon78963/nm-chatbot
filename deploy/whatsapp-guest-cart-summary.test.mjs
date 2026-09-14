import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGuestCartCheckoutHandoffPrompt,
  formatGuestCartOpeningSummary,
  isGuestCartCheckoutRequest,
  prependGuestCartSummary,
} from '../dist/application/services/whatsapp-guest-cart-summary.service.js';

test('formatGuestCartOpeningSummary formats item count and total', () => {
  const text = formatGuestCartOpeningSummary({
    sessionId: 'abc',
    warehouseId: 'wh',
    channel: 'whatsapp',
    currency: 'PEN',
    items: [],
    itemCount: 3,
    subtotal: 120,
    total: 120,
    source: 'bot',
    createdAt: '',
    updatedAt: '',
    expiresAt: '',
  });

  assert.match(text, /3 producto/);
  assert.match(text, /120\.00/);
});

test('prependGuestCartSummary puts cart block before welcome', () => {
  const merged = prependGuestCartSummary('Hola Maritex', '🛒 Tienes 2 productos');
  assert.match(merged, /^🛒 Tienes 2 productos/);
  assert.match(merged, /Hola Maritex$/);
});

test('isGuestCartCheckoutRequest detects checkout phrases', () => {
  assert.equal(isGuestCartCheckoutRequest('sí, armemos el pedido'), true);
  assert.equal(isGuestCartCheckoutRequest('quiero pagar mi carrito'), true);
  assert.equal(isGuestCartCheckoutRequest('precio del polo'), false);
});

test('buildGuestCartCheckoutHandoffPrompt mentions item count', () => {
  const prompt = buildGuestCartCheckoutHandoffPrompt(2, 99.8);
  assert.match(prompt, /2 producto/);
  assert.match(prompt, /99\.80/);
});
