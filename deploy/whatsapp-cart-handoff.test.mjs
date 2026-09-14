import assert from 'node:assert/strict';
import test from 'node:test';

import { appendCartHandoffDeepLink } from '../dist/application/services/handoff-lead-messages.service.js';
import {
  mapPdpIntentToGuestCartItem,
  parsePdpPurchaseMessage,
} from '../dist/application/services/ecommerce-pdp-purchase.service.js';

test('appendCartHandoffDeepLink appends wa.me URL with hashed cart id', () => {
  const sessionId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const handoffUrl =
    `https://wa.me/51915213408?text=${encodeURIComponent(
      `Hola, vengo del bot. Quiero concretar el pedido de mi carrito [${sessionId}]`,
    )}`;

  const message = appendCartHandoffDeepLink(
    'Te comunico con un asesor de Maritex.',
    handoffUrl,
    sessionId,
  );

  assert.match(message, /https:\/\/wa\.me\/51915213408/);
  assert.match(message, /a1b2c3d4e5f60718293a4b5c6d7e8f90/);
});

test('appendCartHandoffDeepLink replaces template placeholders', () => {
  const message = appendCartHandoffDeepLink(
    'Toca {cartHandoffUrl} — carrito {cartSessionId}',
    'https://wa.me/51915213408?text=hola',
    'deadbeefdeadbeefdeadbeefdeadbeef',
  );

  assert.equal(
    message,
    'Toca https://wa.me/51915213408?text=hola — carrito deadbeefdeadbeefdeadbeefdeadbeef',
  );
});

test('mapPdpIntentToGuestCartItem snapshots PDP purchase for Redis cart', () => {
  const intent = parsePdpPurchaseMessage(
    [
      'Hola Malu, quiero comprar este producto:',
      'Producto: Polo Niño Azul',
      'Cantidad: 2',
      'Precio unitario: S/ 49.90',
      'Talla: 8',
      'Color: Azul',
      '[NM-PDP:pid=a1b2c3d4;qty=2;sku=7890123456789]',
    ].join('\n'),
  );

  assert.ok(intent);
  const item = mapPdpIntentToGuestCartItem(intent);
  assert.equal(item.name, 'Polo Niño Azul');
  assert.equal(item.quantity, 2);
  assert.equal(item.unitPrice, 49.9);
  assert.equal(item.variation, '8 / Azul');
  assert.equal(item.productIdPrefix, 'a1b2c3d4');
});
