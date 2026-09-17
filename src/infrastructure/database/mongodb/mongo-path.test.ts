import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isChatbotMongoPathEnabled } from './mongo-path.ts';

test('Mongo/UPRIT está aislado salvo CHATBOT_MONGO_ENABLED=true', () => {
  const previous = process.env['CHATBOT_MONGO_ENABLED'];
  delete process.env['CHATBOT_MONGO_ENABLED'];
  assert.equal(isChatbotMongoPathEnabled(), false);

  process.env['CHATBOT_MONGO_ENABLED'] = 'true';
  assert.equal(isChatbotMongoPathEnabled(), true);

  process.env['CHATBOT_MONGO_ENABLED'] = 'false';
  assert.equal(isChatbotMongoPathEnabled(), false);

  if (previous === undefined) {
    delete process.env['CHATBOT_MONGO_ENABLED'];
  } else {
    process.env['CHATBOT_MONGO_ENABLED'] = previous;
  }
});
