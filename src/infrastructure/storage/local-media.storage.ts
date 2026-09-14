import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaStoragePort, SaveMediaOptions, SavedMedia } from '../../application/ports/media-storage.port.js';
import { logger } from '../shared/logger.js';

const MIME_TO_EXT: Record<string, string> = {
  // Images
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  // Documents
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  // Audio
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  // Video
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
};

/**
 * Saves media files to the local filesystem under MEDIA_STORAGE_PATH.
 * Files are served via GET /media/:storageKey (JWT-protected route).
 */
export class LocalMediaStorage implements MediaStoragePort {
  private readonly storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? process.env['MEDIA_STORAGE_PATH'] ?? '/app/uploads';
  }

  async save(buffer: Buffer, options: SaveMediaOptions): Promise<SavedMedia> {
    const ext = MIME_TO_EXT[options.mimeType] ?? 'bin';
    const storageKey = `${Date.now()}-${randomUUID()}.${ext}`;
    const dir = path.join(this.storagePath, options.conversationId);

    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'EACCES') {
        throw new Error(`Sin permiso de escritura en el directorio de uploads: ${dir}. Contacta al administrador.`);
      }
      throw err;
    }
    await fs.writeFile(path.join(dir, storageKey), buffer);

    logger.debug('[LocalMediaStorage] Saved media', {
      storageKey,
      conversationId: options.conversationId,
      bytes: buffer.length,
    });

    return {
      storageKey,
      publicPath: `/media/${options.conversationId}/${storageKey}`,
    };
  }

  /** Returns the absolute filesystem path for a given conversationId + storageKey. */
  resolvePath(conversationId: string, storageKey: string): string {
    return path.join(this.storagePath, conversationId, storageKey);
  }
}
