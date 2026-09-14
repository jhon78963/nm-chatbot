import { logger } from '../../infrastructure/shared/logger.js';
import { formatMetaApiError } from '../../infrastructure/webhooks/meta/meta-api-error.js';

export interface BatchedInboundText {
  content: string;
  externalMessageId: string;
  userMessageId: string;
  conversationId: string;
  funnelUserId: string;
  isFirstMessage: boolean;
  profileName?: string;
  timestamp: number;
}

type FlushHandler = (batch: BatchedInboundText[]) => Promise<void>;

interface BufferEntry {
  items: BatchedInboundText[];
  timer: ReturnType<typeof setTimeout>;
  onFlush: FlushHandler;
}

/**
 * Per-phone debounce for inbound WhatsApp text.
 * Saves each message immediately (caller responsibility); only delays the AI reply
 * so rapid-fire fragments become one combined turn.
 */
export class MessageBatchDebouncer {
  private readonly buffers = new Map<string, BufferEntry>();

  constructor(private readonly delayMs: number) {}

  get enabled(): boolean {
    return this.delayMs > 0;
  }

  /**
   * Queues an inbound text for the given phone key.
   * Resets the idle timer on every call; when the timer fires, onFlush receives
   * all items accumulated since the previous flush (oldest → newest).
   */
  schedule(phoneKey: string, item: BatchedInboundText, onFlush: FlushHandler): void {
    if (!this.enabled) {
      void onFlush([item]).catch((err) => {
        logger.error('[MessageBatchDebouncer] Immediate flush failed', {
          phone: phoneKey,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

    const existing = this.buffers.get(phoneKey);
    if (existing) {
      clearTimeout(existing.timer);
      existing.items.push(item);
      existing.onFlush = onFlush;
      existing.timer = setTimeout(() => {
        void this.flush(phoneKey);
      }, this.delayMs);
      logger.debug('[MessageBatchDebouncer] Batch extended', {
        phone: phoneKey,
        batchSize: existing.items.length,
        delayMs: this.delayMs,
      });
      return;
    }

    const entry: BufferEntry = {
      items: [item],
      onFlush,
      timer: setTimeout(() => {
        void this.flush(phoneKey);
      }, this.delayMs),
    };
    this.buffers.set(phoneKey, entry);
    logger.debug('[MessageBatchDebouncer] Batch started', {
      phone: phoneKey,
      delayMs: this.delayMs,
    });
  }

  /** Cancels a pending batch without flushing (e.g. conversation moved to human). */
  cancel(phoneKey: string): void {
    const existing = this.buffers.get(phoneKey);
    if (!existing) return;
    clearTimeout(existing.timer);
    this.buffers.delete(phoneKey);
  }

  private async flush(phoneKey: string): Promise<void> {
    const entry = this.buffers.get(phoneKey);
    if (!entry) return;
    this.buffers.delete(phoneKey);

    const batch = entry.items;
    logger.info('[MessageBatchDebouncer] Flushing batch', {
      phone: phoneKey,
      batchSize: batch.length,
    });

    try {
      await entry.onFlush(batch);
    } catch (err) {
      logger.error('[MessageBatchDebouncer] Flush handler failed', {
        phone: phoneKey,
        batchSize: batch.length,
        ...formatMetaApiError(err),
      });
    }
  }
}

export function loadMessageDebounceMs(): number {
  const raw = process.env['MESSAGE_DEBOUNCE_MS'];
  if (raw === undefined || raw.trim() === '') return 5_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 5_000;
  return Math.floor(parsed);
}

/** Joins rapid-fire user texts into one prompt turn. */
export function joinBatchedUserTexts(texts: string[]): string {
  return texts
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n');
}
