import { Router, type Request, type Response } from 'express';
import type { ChatController } from '../controllers/chat.controller.js';

// Intentionally NOT under "/api/v1" — that prefix is globally JWT-guarded by the
// agent-inbox router for the internal admin panel. This engine is meant to be
// reachable by public clients (e.g. a website chat widget), so it lives under its own path.
export function createChatRouter(controller: ChatController): Router {
  const router = Router();

  // POST /api/chat/message — { sessionId?: string, message: string }
  router.post('/api/chat/message', (req: Request, res: Response) => {
    void controller.sendMessage(req, res);
  });

  return router;
}
