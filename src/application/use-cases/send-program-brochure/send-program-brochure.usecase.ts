import axios from 'axios';
import type { ProgramRepository } from '../../../domain/repositories/program.repository.js';
import type { MessagingProviderPort } from '../../ports/messaging-provider.port.js';
import type { MetaMediaService } from '../../../infrastructure/webhooks/meta/meta-media.service.js';
import type { Program } from '../../../domain/entities/program.entity.js';
import { logger } from '../../../infrastructure/shared/logger.js';

export interface SendProgramBrochureInput {
  to: string;
  programId?: string;
  slug?: string;
}

export interface SendProgramBrochureOutput {
  messageId: string;
  sentAs: 'document' | 'text';
  programName: string;
  brochureUrl: string;
}

const BROCHURE_KEYWORD_PATTERN =
  /\b(brochure|brochures|folleto|folletos|pdf|descargar\s+pdf|env[ií]ame\s+el\s+pdf|m[aá]ndame\s+el\s+pdf)\b/i;

/** Detects explicit brochure/PDF requests from user text. */
export function isBrochureRequest(text: string): boolean {
  return BROCHURE_KEYWORD_PATTERN.test(text.trim());
}

function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().includes('.pdf');
  }
}

/**
 * F7 — Sends a program brochure via WhatsApp.
 * PDF remote URLs: download → uploadMedia → sendDocument.
 * HTML/other URLs: fallback sendTextMessage with link.
 */
export class SendProgramBrochureUseCase {
  constructor(
    private readonly programRepo: ProgramRepository,
    private readonly messagingProvider: MessagingProviderPort,
    private readonly metaMediaService: MetaMediaService,
  ) {}

  async execute(input: SendProgramBrochureInput): Promise<SendProgramBrochureOutput> {
    const program = await this.resolveProgram(input);
    if (!program) {
      throw new Error('Programa no encontrado');
    }
    if (!program.brochureUrl.trim()) {
      throw new Error(`El programa "${program.name}" no tiene brochure configurado`);
    }

    const brochureUrl = program.brochureUrl.trim();

    if (isPdfUrl(brochureUrl)) {
      return this.sendAsPdf(input.to, program, brochureUrl);
    }

    return this.sendAsTextLink(input.to, program, brochureUrl);
  }

  /** Resolve program from id, slug, or direct Program reference. */
  async resolveProgram(input: SendProgramBrochureInput): Promise<Program | null> {
    if (input.programId) {
      return this.programRepo.findById(input.programId);
    }
    if (input.slug) {
      return this.programRepo.findBySlug(input.slug);
    }
    return null;
  }

  private async sendAsPdf(
    to: string,
    program: Program,
    brochureUrl: string,
  ): Promise<SendProgramBrochureOutput> {
    logger.info('[SendProgramBrochure] Downloading PDF brochure', {
      program: program.name,
      url: brochureUrl,
    });

    const response = await axios.get<ArrayBuffer>(brochureUrl, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxContentLength: 100 * 1024 * 1024,
    });

    const buffer = Buffer.from(response.data);
    const contentType = (response.headers['content-type'] as string | undefined) ?? 'application/pdf';
    const mimeType = contentType.split(';')[0]?.trim() || 'application/pdf';

    const { mediaId } = await this.metaMediaService.uploadMedia(buffer, mimeType);

    const fileName = `${program.slug || program.id}-brochure.pdf`;
    const caption = `Brochure — ${program.name}`;

    const result = await this.messagingProvider.sendMediaMessage({
      to,
      type: 'document',
      mediaId,
      fileName,
      caption,
    });

    logger.info('[SendProgramBrochure] PDF brochure sent', {
      program: program.name,
      messageId: result.messageId,
    });

    return {
      messageId: result.messageId,
      sentAs: 'document',
      programName: program.name,
      brochureUrl,
    };
  }

  private async sendAsTextLink(
    to: string,
    program: Program,
    brochureUrl: string,
  ): Promise<SendProgramBrochureOutput> {
    const body = `Aquí tienes el brochure de ${program.name}:\n${brochureUrl}`;

    const result = await this.messagingProvider.sendTextMessage({ to, body });

    logger.info('[SendProgramBrochure] Brochure link sent as text', {
      program: program.name,
      messageId: result.messageId,
    });

    return {
      messageId: result.messageId,
      sentAs: 'text',
      programName: program.name,
      brochureUrl,
    };
  }
}
