import { Router, type Request, type Response } from 'express';
import { authenticateAgentJwt } from '../middlewares/authenticate-agent-jwt.middleware.js';
import { QuickReplyUseCase, ForbiddenError } from '../../../application/use-cases/quick-reply/quick-reply.usecase.js';
import type { QuickReplyPrismaRepository } from '../../database/prisma/repositories/quick-reply.prisma-repository.js';

export function createQuickRepliesRouter(quickReplyRepo: QuickReplyPrismaRepository): Router {
  const router = Router();
  const useCase = new QuickReplyUseCase(quickReplyRepo);

  router.use('/api/v1', authenticateAgentJwt);

  // GET /api/v1/quick-replies
  router.get('/api/v1/quick-replies', async (_req: Request, res: Response) => {
    const list = await useCase.list();
    res.json({ quickReplies: list });
  });

  // POST /api/v1/quick-replies
  router.post('/api/v1/quick-replies', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const role = req.agent!.role;
    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    const body = typeof req.body?.body === 'string' ? req.body.body : '';

    if (!title.trim() || !body.trim()) {
      res.status(400).json({ error: 'title y body son requeridos' });
      return;
    }

    try {
      const result = await useCase.create({ title, body }, agentId, role);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      throw err;
    }
  });

  // PATCH /api/v1/quick-replies/:id
  router.patch('/api/v1/quick-replies/:id', async (req: Request, res: Response) => {
    const role = req.agent!.role;
    const id = String(req.params['id']);
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const body = typeof req.body?.body === 'string' ? req.body.body : undefined;

    try {
      const result = await useCase.update(id, { title, body }, role);
      res.json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Respuesta rápida no encontrada') { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  });

  // DELETE /api/v1/quick-replies/:id
  router.delete('/api/v1/quick-replies/:id', async (req: Request, res: Response) => {
    const role = req.agent!.role;
    const id = String(req.params['id']);

    try {
      await useCase.delete(id, role);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Respuesta rápida no encontrada') { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  });

  return router;
}
