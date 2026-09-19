import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isGreeting } from './bot-menu.constants.ts';
import {
  isLikelySpam,
  shouldBotRespondToInbound,
} from './commercial-interest-filter.service.ts';

function inbound(content: string) {
  return { content, conversation: null };
}

test('saludo con emoji llega al bot', () => {
  assert.equal(isGreeting('Hola 👋'), true);
  assert.equal(shouldBotRespondToInbound(inbound('Hola 👋')), true);
});

test('consulta vaga del primer contacto no se ignora', () => {
  assert.equal(shouldBotRespondToInbound(inbound('Hola quiero información')), true);
  assert.equal(shouldBotRespondToInbound(inbound('buenas tardes como estas')), true);
  assert.equal(shouldBotRespondToInbound(inbound('ok')), true);
});

test('follow-up corto después del menú sigue respondiendo', () => {
  const conversation = {
    isHumanMode: () => false,
    handoffState: 'none',
    messages: [{ role: 'assistant' }],
  };
  assert.equal(
    shouldBotRespondToInbound({ content: '1', conversation: conversation as never }),
    true,
  );
  assert.equal(
    shouldBotRespondToInbound({ content: 'si', conversation: conversation as never }),
    true,
  );
});

test('spam de apuestas y scam se ignora', () => {
  assert.equal(isLikelySpam('judi slot bonus deposit'), true);
  assert.equal(shouldBotRespondToInbound(inbound('https://spam.example/promo')), false);
  assert.equal(shouldBotRespondToInbound(inbound('click here free money casino')), false);
});

test('minimo de pedido en español no se trata como spam indonesio', () => {
  assert.equal(isLikelySpam('min 12 unidades por mayor'), false);
  assert.equal(shouldBotRespondToInbound(inbound('min 12 unidades')), true);
});
