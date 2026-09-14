import { Router } from 'express';
import type { WhatsAppController } from '../../webhooks/meta/whatsapp.controller.js';
import { verifyMetaSignatureMiddleware } from '../middlewares/verify-meta-signature.middleware.js';

export function createWebhookRouter(controller: WhatsAppController): Router {
  const router = Router();

  router.get('/webhook', (req, res) => controller.verify(req, res));
  router.post('/webhook', verifyMetaSignatureMiddleware, (req, res) =>
    controller.receive(req, res),
  );

  return router;
}
