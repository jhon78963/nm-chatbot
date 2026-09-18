import { Router, type Request, type Response } from 'express';
import type { ChatController } from '../controllers/chat.controller.js';

export function createChatRouter(controller: ChatController): Router {
  const router = Router();

  router.get('/api/chat/widget/config', (req: Request, res: Response) => {
    void controller.widgetConfig(req, res);
  });

  router.post('/api/chat/widget/message', (req: Request, res: Response) => {
    void controller.sendWidgetMessage(req, res);
  });

  router.post('/api/chat/message', (req: Request, res: Response) => {
    void controller.sendMessage(req, res);
  });

  return router;
}
