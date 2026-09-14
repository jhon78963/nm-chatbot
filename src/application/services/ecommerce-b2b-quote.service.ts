const NM_B2B_REF_PATTERN = /\[NM-B2B:([^\]]+)\]/i;
const QUOTE_LINE_PATTERN = /^Referencia:\s*(.+)$/im;
const BUSINESS_LINE_PATTERN = /^Negocio:\s*(.+)$/im;

export interface ParsedB2bQuoteIntent {
  quoteNumber: string | null;
  businessName: string | null;
  city: string | null;
}

function parseRefToken(raw: string): Partial<ParsedB2bQuoteIntent> & { source?: string } {
  const parsed: Partial<ParsedB2bQuoteIntent> & { source?: string } = {};

  for (const segment of raw.split(';')) {
    const [key, value] = segment.split('=').map((part) => part.trim());
    if (!key || !value) continue;

    if (key === 'ref') {
      parsed.quoteNumber = value;
    } else if (key === 'city') {
      parsed.city = value;
    } else if (key === 'source') {
      parsed.source = value;
    }
  }

  return parsed;
}

export function parseB2bQuoteMessage(text: string): ParsedB2bQuoteIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const refMatch = trimmed.match(NM_B2B_REF_PATTERN);
  const fromRef = refMatch?.[1] ? parseRefToken(refMatch[1]) : {};
  const quoteNumber = trimmed.match(QUOTE_LINE_PATTERN)?.[1]?.trim() ?? fromRef.quoteNumber ?? null;
  const businessName = trimmed.match(BUSINESS_LINE_PATTERN)?.[1]?.trim() ?? null;

  const hasWholesaleIntent =
    Boolean(refMatch)
    || (
      /\b(cotizaci[oó]n|pedido)\s+mayorista\b/i.test(trimmed)
      && /\b(negocio|revendedor|por mayor|mayorista)\b/i.test(trimmed)
    );

  if (!hasWholesaleIntent) {
    return null;
  }

  return {
    quoteNumber,
    businessName,
    city: fromRef.city ?? null,
  };
}

export function buildB2bQuoteHandoffPrompt(intent: ParsedB2bQuoteIntent): string {
  const businessLabel = intent.businessName?.trim() || 'tu negocio';
  const quoteSuffix = intent.quoteNumber ? ` (${intent.quoteNumber})` : '';

  return (
    `¡Gracias! Recibí tu solicitud mayorista para *${businessLabel}*${quoteSuffix}.\n\n` +
    '¿Te comunico con un asesor de Maritex para enviarte precios mayoristas y armar tu pedido?'
  );
}
