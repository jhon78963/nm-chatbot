import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  LoginAgentUseCase,
  UnauthorizedError,
} from '../../../application/use-cases/agent-auth/login-agent.usecase.js';
import { SsoErpLoginUseCase } from '../../../application/use-cases/agent-auth/sso-erp-login.usecase.js';
import {
  isErpSsoOnlyEnabled,
  resolveErpPanelUrl,
} from '../../../application/services/erp-sso.config.js';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import { clientIp, logAgentAudit } from '../../shared/agent-audit.logger.js';

export function createAuthRouter(agentRepo: AgentRepository): Router {
  const router = Router();
  const loginUseCase = new LoginAgentUseCase(agentRepo);
  const ssoUseCase = new SsoErpLoginUseCase(agentRepo);

  router.get('/api/v1/auth/config', (_req: Request, res: Response) => {
    res.json({
      ssoOnly: isErpSsoOnlyEnabled(),
      erpPanelUrl: resolveErpPanelUrl(),
    });
  });

  router.post('/api/v1/auth/sso-erp', async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const bodyToken = (req.body as { token?: string } | undefined)?.token;
    const erpAccessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : bodyToken;

    if (!erpAccessToken) {
      res.status(400).json({ error: 'Token ERP requerido' });
      return;
    }

    try {
      const result = await ssoUseCase.execute({ erpAccessToken });
      logAgentAudit({
        action: 'sso_erp_success',
        agentId: result.agent.id,
        agentUsername: result.agent.username,
        agentName: result.agent.name,
        ip: clientIp(req),
      });
      res.json(result);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logAgentAudit({
          action: 'sso_erp_failed',
          detail: err.message,
          ip: clientIp(req),
        });
        res.status(401).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/api/v1/auth/login', async (req: Request, res: Response) => {
    if (isErpSsoOnlyEnabled()) {
      res.status(403).json({
        error: 'El acceso al chatbot es solo desde el ERP. Abre el panel en Aplicaciones → Chatbot.',
      });
      return;
    }

    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'username y password son requeridos' });
      return;
    }

    try {
      const result = await loginUseCase.execute({ username, password });
      logAgentAudit({
        action: 'login_success',
        agentId: result.agent.id,
        agentUsername: result.agent.username,
        agentName: result.agent.name,
        ip: clientIp(req),
      });
      res.json(result);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logAgentAudit({
          action: 'login_failed',
          agentUsername: username.toLowerCase().trim(),
          detail: err.message,
          ip: clientIp(req),
        });
        res.status(401).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/api/v1/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const secret = process.env['JWT_SECRET'];
        if (secret) {
          const payload = jwt.verify(authHeader.slice(7), secret) as {
            sub: string;
            username: string;
            name: string;
          };
          logAgentAudit({
            action: 'logout',
            agentId: payload.sub,
            agentUsername: payload.username,
            agentName: payload.name,
            ip: clientIp(req),
          });
        }
      } catch {
        // Token inválido en logout — no bloquear respuesta
      }
    }
    res.json({ message: 'Sesión cerrada correctamente' });
  });

  return router;
}
