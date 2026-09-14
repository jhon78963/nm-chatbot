export interface OutboundTextMessage {
  to: string;
  body: string;
}

export interface OutboundMediaMessage {
  to: string;
  type: 'image' | 'document' | 'audio' | 'video';
  /** Use mediaId (uploaded to Meta) or link (public URL), not both */
  mediaId?: string;
  link?: string;
  caption?: string;
  fileName?: string;
}

export interface OutboundMessageResult {
  messageId: string;
  status: string;
}

// ── Interactive messages ────────────────────────────────────────────────────

export interface InteractiveButton {
  /** Unique reply identifier (max 256 chars). */
  id: string;
  /** Button label shown to user (max 20 chars). */
  title: string;
}

export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveListSection {
  title: string;
  rows: InteractiveListRow[];
}

/** Outbound interactive-buttons message (max 3 buttons). */
export interface OutboundInteractiveButtonsMessage {
  to: string;
  body: string;
  buttons: InteractiveButton[];
}

/** Outbound interactive-list message (single section supported by most flows). */
export interface OutboundInteractiveListMessage {
  to: string;
  body: string;
  /** Label shown on the list-trigger button. */
  buttonText: string;
  sections: InteractiveListSection[];
}

/** Outbound CTA URL interactive message (Meta API v20+). */
export interface OutboundCtaUrlMessage {
  to: string;
  body: string;
  displayText: string;
  url: string;
}

/** Outbound location pin (Meta WhatsApp Cloud API). */
export interface OutboundLocationMessage {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Port that decouples the application layer from any messaging provider (WhatsApp, SMS, etc.).
 */
export interface MessagingProviderPort {
  sendTextMessage(message: OutboundTextMessage): Promise<OutboundMessageResult>;
  sendMediaMessage(message: OutboundMediaMessage): Promise<OutboundMessageResult>;
  sendLocation?(message: OutboundLocationMessage): Promise<OutboundMessageResult>;
  sendInteractiveButtons?(
    message: OutboundInteractiveButtonsMessage,
  ): Promise<OutboundMessageResult>;
  sendInteractiveList?(
    message: OutboundInteractiveListMessage,
  ): Promise<OutboundMessageResult>;
  sendCtaUrl?(message: OutboundCtaUrlMessage): Promise<OutboundMessageResult>;
}
