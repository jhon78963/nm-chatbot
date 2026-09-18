import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPlatformSubdomainOrigin } from './platform-cors.ts';

test('acepta paneles *.zerogroups.net.pe de un solo label', () => {
  assert.equal(
    isPlatformSubdomainOrigin('https://acme.zerogroups.net.pe', 'zerogroups.net.pe'),
    true,
  );
  assert.equal(
    isPlatformSubdomainOrigin('https://tienda.empresa.com', 'zerogroups.net.pe'),
    false,
  );
});
