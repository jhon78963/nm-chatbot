import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ForbiddenError, assertConversationTenant } from './conversation-access.service.ts';

function conversationWithTenant(tenantId?: string) {
  return {
    metaData: tenantId
      ? { filterType: null, filterValue: null, tenantId }
      : { filterType: null, filterValue: null },
  };
}

test('un tenant no ve conversaciones de otro tenant', () => {
  assert.throws(
    () =>
      assertConversationTenant(conversationWithTenant('tenant-b') as never, {
        tenantId: 'tenant-a',
        isPlatformTenant: false,
      }),
    ForbiddenError,
  );
});

test('un tenant no ve conversaciones legacy sin tenantId', () => {
  assert.throws(
    () =>
      assertConversationTenant(conversationWithTenant() as never, {
        tenantId: 'tenant-a',
        isPlatformTenant: false,
      }),
    ForbiddenError,
  );
});

test('plataforma sí ve conversaciones legacy sin tenantId', () => {
  assert.doesNotThrow(() =>
    assertConversationTenant(conversationWithTenant() as never, {
      tenantId: 'platform',
      isPlatformTenant: true,
    }),
  );
});
