import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/logger.js';
import type { TenantWhatsAppRegistry } from '../../whatsapp/tenant-whatsapp-registry.js';

function signaturesMatch(incoming: string, expected: string): boolean {
  const incomingBuffer = Buffer.from(incoming);
  const expectedBuffer = Buffer.from(expected);
  return (
    incomingBuffer.length === expectedBuffer.length &&
    timingSafeEqual(incomingBuffer, expectedBuffer)
  );
}

function phoneNumberIdFromRawBody(rawBody: Buffer): string | null {
  try {
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      entry?: Array<{
        changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }>;
      }>;
    };
    const id = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export function createVerifyMetaSignatureMiddleware(registry: TenantWhatsAppRegistry) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const signatureHeader = req.headers['x-hub-signature-256'];
    if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) {
      logger.warn('[VerifyMetaSignature] Missing or malformed x-hub-signature-256 header', {
        ip: req.ip,
        path: req.path,
      });
      res.sendStatus(403);
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      logger.warn('[VerifyMetaSignature] Raw body unavailable for signature check', {
        ip: req.ip,
        path: req.path,
      });
      res.sendStatus(403);
      return;
    }

    const phoneNumberId = phoneNumberIdFromRawBody(rawBody);
    const account = phoneNumberId ? await registry.getByPhoneNumberId(phoneNumberId) : null;
    const secrets = Array.from(
      new Set(
        [account?.appSecret?.trim(), account?.isPlatform ? process.env['WEBHOOK_SECRET']?.trim() : undefined].filter(
          (item): item is string => Boolean(item),
        ),
      ),
    );

    if (secrets.length === 0) {
      logger.warn('[VerifyMetaSignature] Sin App Secret para este Phone Number ID', {
        phoneNumberId,
      });
      res.sendStatus(403);
      return;
    }

    const matched = secrets.some((secret) => {
      const expectedSignature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
      return signaturesMatch(signatureHeader, expectedSignature);
    });

    if (!matched) {
      logger.warn('[VerifyMetaSignature] Signature mismatch — request rejected', {
        ip: req.ip,
        path: req.path,
        phoneNumberId,
      });
      res.sendStatus(403);
      return;
    }

    next();
  };
}
