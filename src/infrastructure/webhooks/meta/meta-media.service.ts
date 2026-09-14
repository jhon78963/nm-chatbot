import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import { logger } from '../../shared/logger.js';

/** Max sizes enforced by Meta WhatsApp Cloud API */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB
const MAX_DOC_BYTES   = 100 * 1024 * 1024; // 100 MB

interface MetaMediaUrlResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
}

interface MetaUploadResponse {
  id: string;
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

export interface UploadedMedia {
  mediaId: string;
}

/**
 * Handles Meta WhatsApp Cloud API media operations:
 * - downloadMedia: fetch binary from Meta CDN given a media-id
 * - uploadMedia:   upload a local buffer to Meta and get a media-id back
 */
export class MetaMediaService {
  private readonly client: AxiosInstance;
  private readonly phoneNumberId: string;

  constructor(config: {
    token: string;
    phoneNumberId: string;
    apiVersion: string;
    baseUrl: string;
    timeoutMs?: number;
  }) {
    this.phoneNumberId = config.phoneNumberId;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/${config.apiVersion}`,
      timeout: config.timeoutMs ?? 30_000,
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    });
  }

  /**
   * Download a media file from Meta given its media-id.
   * Step 1: retrieve the temporary CDN URL.
   * Step 2: download binary from that URL.
   */
  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    logger.debug('[MetaMedia] Fetching media URL', { mediaId });

    const metaResponse = await this.client.get<MetaMediaUrlResponse>(`/${mediaId}`);
    const { url, mime_type: mimeType } = metaResponse.data;

    logger.debug('[MetaMedia] Downloading binary from CDN', { mediaId, mimeType });

    const binary = await axios.get<Buffer>(url, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: this.client.defaults.headers['Authorization'] as string,
      },
      timeout: 60_000,
    });

    const buffer = Buffer.from(binary.data);
    logger.debug('[MetaMedia] Download complete', { mediaId, bytes: buffer.length });

    return { buffer, mimeType };
  }

  /**
   * Upload a buffer to Meta and receive a reusable media-id.
   * Validates size limits before uploading.
   */
  async uploadMedia(buffer: Buffer, mimeType: string): Promise<UploadedMedia> {
    const isImage = mimeType.startsWith('image/');
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;

    if (buffer.length > limit) {
      const limitMb = Math.round(limit / 1024 / 1024);
      throw new Error(
        `[MetaMedia] File too large: ${buffer.length} bytes exceeds ${limitMb} MB limit for ${isImage ? 'image' : 'document'}`,
      );
    }

    const extension = this.mimeToExtension(mimeType);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', buffer, { filename: `upload.${extension}`, contentType: mimeType });

    logger.debug('[MetaMedia] Uploading media', { mimeType, bytes: buffer.length });

    const response = await this.client.post<MetaUploadResponse>(
      `/${this.phoneNumberId}/media`,
      form,
      { headers: form.getHeaders() },
    );

    const mediaId = response.data.id;
    logger.debug('[MetaMedia] Upload complete', { mediaId });

    return { mediaId };
  }

  private mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'application/pdf': 'pdf',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'video/mp4': 'mp4',
    };
    return map[mimeType] ?? 'bin';
  }
}
