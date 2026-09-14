import multer from 'multer';
import type { MessageContentType } from '../../../domain/entities/message.entity.js';

/** Meta limits: images 5 MB, audio/video 16 MB, docs 100 MB. We cap at 20 MB server-side. */
export const AGENT_MEDIA_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_AGENT_MEDIA_MIMES = new Set([
  // ── Images ───────────────────────────────────────────────────────────────
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // ── Documents ────────────────────────────────────────────────────────────
  'application/pdf',
  'application/msword',                                                          // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',    // .docx
  'application/vnd.ms-excel',                                                   // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',          // .xlsx
  'application/vnd.ms-powerpoint',                                              // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',  // .pptx
  'text/csv',                                                                    // .csv
  'text/plain',                                                                  // .txt
  // ── Audio (A4) ───────────────────────────────────────────────────────────
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  // ── Video (A5) ───────────────────────────────────────────────────────────
  'video/mp4',
  'video/3gpp',
  'video/quicktime',  // .mov
  'video/x-msvideo',  // .avi
]);

export const agentMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AGENT_MEDIA_MAX_BYTES },
});

export function mimeToAgentContentType(mimeType: string): MessageContentType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

export function mimeToMetaMediaType(
  mimeType: string,
): 'image' | 'document' | 'audio' | 'video' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

export function validateAgentMediaMime(mimeType: string): void {
  if (!ALLOWED_AGENT_MEDIA_MIMES.has(mimeType)) {
    throw new Error(
      `Tipo de archivo no permitido: ${mimeType}. ` +
        `Permitidos: imágenes (jpeg/png/webp/gif), documentos (pdf/doc/docx/xls/xlsx/ppt/pptx/csv/txt), ` +
        `audio (ogg/mp3/aac/wav), video (mp4/mov/avi/3gpp)`,
    );
  }
}
