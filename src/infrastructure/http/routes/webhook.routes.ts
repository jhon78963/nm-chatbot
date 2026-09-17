import { Router } from 'express';
import type { WhatsAppController } from '../../webhooks/meta/whatsapp.controller.js';
import { createVerifyMetaSignatureMiddleware } from '../middlewares/verify-meta-signature.middleware.js';
import type { TenantWhatsAppRegistry } from '../../whatsapp/tenant-whatsapp-registry.js';

export function createWebhookRouter(
  controller: WhatsAppController,
  registry: TenantWhatsAppRegistry,
): Router {
  const router = Router();

  router.get('/webhook', (req, res) => {
    void controller.verify(req, res);
  });
  router.post('/webhook', createVerifyMetaSignatureMiddleware(registry), (req, res) =>
    controller.receive(req, res),
  );

  return router;
}
