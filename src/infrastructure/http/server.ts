import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { logger } from '../shared/logger.js';
import type { Router } from 'express';
import { authenticateAgentJwt } from './middlewares/authenticate-agent-jwt.middleware.js';
import {
  embedOnlyAdminMiddleware,
  redirectToErpChatbot,
} from './middlewares/embed-only-admin.middleware.js';

export interface ServerOptions {
  port: number;
  corsOrigins: string[];
  /** Absolute path to local media uploads directory (MEDIA_STORAGE_PATH) */
  mediaStoragePath?: string;
}

export interface AppServer {
  app: Express;
  httpServer: HttpServer;
}

export function createServer(
  webhookRouter: Router,
  authRouter: Router,
  agentInboxRouter: Router,
  options: ServerOptions,
  quickRepliesRouter?: Router,
  chatRouter?: Router,
): AppServer {
  const app = express();

  app.use(
    express.json({
      verify: (req: express.Request, _res: express.Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  app.use((_req: Request, res: Response, next: NextFunction) => {
    const origins = options.corsOrigins;
    const origin = _req.headers['origin'];
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nm-chatbot', timestamp: new Date().toISOString() });
  });

  app.get('/', (_req, res) => {
    redirectToErpChatbot(res);
  });

  // Legacy URLs — send users to the ERP entry point.
  app.get('/login', (_req, res) => {
    redirectToErpChatbot(res);
  });
  app.get('/chat/:id', (_req, res) => {
    redirectToErpChatbot(res);
  });
  app.get('/chat', (_req, res) => {
    redirectToErpChatbot(res);
  });

  // Admin panel React (production build at /admin)
  const adminDist =
    process.env['ADMIN_PANEL_DIST'] ?? path.join(process.cwd(), 'admin', 'dist');
  if (existsSync(adminDist)) {
    app.use('/admin', embedOnlyAdminMiddleware);
    app.use('/admin', express.static(adminDist, { index: 'index.html' }));
    app.get('/admin/*', embedOnlyAdminMiddleware, (_req: Request, res: Response) => {
      res.sendFile(path.join(adminDist, 'index.html'));
    });
    logger.info('[HTTP] Admin panel static files enabled', { adminDist });
  }

  // Serve local media files — JWT required; path segments validated to prevent traversal
  const mediaRoot = options.mediaStoragePath ?? process.env['MEDIA_STORAGE_PATH'] ?? '/app/uploads';
  app.get(
    '/media/:conversationId/:storageKey',
    authenticateAgentJwt,
    (req: Request, res: Response): void => {
      const { conversationId, storageKey } = req.params as { conversationId: string; storageKey: string };
      // Reject any segment containing path traversal characters
      if (/[/\\]/.test(conversationId) || /[/\\]/.test(storageKey)) {
        res.status(400).json({ error: 'Invalid media path' });
        return;
      }
      const filePath = path.join(mediaRoot, conversationId, storageKey);
      res.sendFile(filePath, (err) => {
        if (err) {
          logger.warn('[Media] File not found', { conversationId, storageKey });
          res.status(404).json({ error: 'Media not found' });
        }
      });
    },
  );

  // Webhook first — agentInboxRouter applies JWT globally and must not block Meta POST /webhook
  app.use(webhookRouter);
  app.use(authRouter);
  app.use(agentInboxRouter);
  if (quickRepliesRouter) app.use(quickRepliesRouter);
  if (chatRouter) app.use(chatRouter);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('[HTTP] Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal Server Error' });
  });

  const httpServer = createHttpServer(app);

  httpServer.listen(options.port, () => {
    logger.info(`[HTTP] Server listening on port ${options.port}`);
  });

  return { app, httpServer };
}
