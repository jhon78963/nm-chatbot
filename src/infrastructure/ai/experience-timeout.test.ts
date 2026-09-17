import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_AI_TIMEOUT_FALLBACK, withExperienceTimeout } from './experience-timeout.ts';

test('devuelve fallback si el trabajo supera el timeout de experiencia', async () => {
  const result = await withExperienceTimeout(
    async (signal) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve('late'), 50);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      }),
    10,
    DEFAULT_AI_TIMEOUT_FALLBACK,
  );

  assert.equal(result.timedOut, true);
  assert.equal(result.value, DEFAULT_AI_TIMEOUT_FALLBACK);
});

test('timeout 0 deja pasar la respuesta real (escape hatch producción)', async () => {
  const result = await withExperienceTimeout(async () => 'ok', 0, DEFAULT_AI_TIMEOUT_FALLBACK);
  assert.equal(result.timedOut, false);
  assert.equal(result.value, 'ok');
});
