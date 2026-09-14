import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/logger.js';

/**
 * Middleware that verifies the HMAC-SHA256 signature sent by Meta on every
 * inbound webhook POST request.
 *
 * Meta signs the raw payload with the app secret and sends the digest in the
 * `x-hub-signature-256` header as `sha256=<hex>`. This middleware recomputes
 * the same digest using `WEBHOOK_SECRET` and rejects any request where the
 * signatures do not match, preventing spoofed payloads from reaching the
 * controller.
 *
 * Requires `req.rawBody` to be populated by the `verify` callback registered
 * on `express.json()` in the server setup.
 */
export function verifyMetaSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env['WEBHOOK_SECRET'];

  if (!secret) {
    logger.error('[VerifyMetaSignature] WEBHOOK_SECRET is not configured');
    res.sendStatus(500);
    return;
  }

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

  const expectedSignature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  const incomingBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);

  // Constant-time comparison to prevent timing-based attacks.
  const signaturesMatch =
    incomingBuffer.length === expectedBuffer.length &&
    timingSafeEqual(incomingBuffer, expectedBuffer);

  if (!signaturesMatch) {
    logger.warn('[VerifyMetaSignature] Signature mismatch — request rejected', {
      ip: req.ip,
      path: req.path,
    });
    res.sendStatus(403);
    return;
  }

  next();
}
