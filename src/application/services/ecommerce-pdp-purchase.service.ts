const NM_PDP_REF_PATTERN = /\[NM-PDP:([^\]]+)\]/i;
const PRODUCT_LINE_PATTERN = /^Producto:\s*(.+)$/im;
const SKU_LINE_PATTERN = /^SKU:\s*(.+)$/im;
const QTY_LINE_PATTERN = /^Cantidad:\s*(\d+)/im;
const SIZE_LINE_PATTERN = /^Talla:\s*(.+)$/im;
const COLOR_LINE_PATTERN = /^Color:\s*(.+)$/im;
const PRICE_LINE_PATTERN = /^Precio unitario:\s*(.+)$/im;
const PRODUCT_URL_PATTERN =
  /https?:\/\/(?:www\.)?novedadesmaritex\.net\.pe\/producto\/[^\s]+/i;

export interface WhatsAppGuestCartItemInput {
  productIdPrefix?: string;
  sku?: string;
  name: string;
  variation?: string;
  productUrl?: string;
  quantity: number;
  unitPrice?: number;
}

export interface ParsedPdpPurchaseIntent {
  productName: string | null;
  sku: string | null;
  quantity: number | null;
  productUrl: string | null;
  productIdPrefix: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  unitPrice: number | null;
}

function parseUnitPrice(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseRefToken(raw: string): Partial<ParsedPdpPurchaseIntent> {
  const parsed: Partial<ParsedPdpPurchaseIntent> = {};

  for (const segment of raw.split(";")) {
    const [key, value] = segment.split("=").map((part) => part.trim());
    if (!key || !value) continue;

    if (key === "pid") {
      parsed.productIdPrefix = value.toLowerCase();
    } else if (key === "sku") {
      parsed.sku = value;
    } else if (key === "qty") {
      const qty = Number.parseInt(value, 10);
      parsed.quantity = Number.isFinite(qty) ? qty : null;
    }
  }

  return parsed;
}

export function parsePdpPurchaseMessage(text: string): ParsedPdpPurchaseIntent | null {
  const all = parseAllPdpPurchaseIntents(text);
  return all[0] ?? null;
}

/** Parses every [NM-PDP:…] block in one WhatsApp message (multi-product cart sync). */
export function parseAllPdpPurchaseIntents(text: string): ParsedPdpPurchaseIntent[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const refPattern = /\[NM-PDP:([^\]]+)\]/gi;
  const refs = [...trimmed.matchAll(refPattern)];
  if (refs.length === 0) {
    const single = parseSinglePdpPurchaseIntent(trimmed);
    return single ? [single] : [];
  }

  const intents: ParsedPdpPurchaseIntent[] = [];
  for (let i = 0; i < refs.length; i += 1) {
    const match = refs[i];
    const refRaw = match?.[1];
    if (!refRaw || match.index == null) continue;

    const fromRef = parseRefToken(refRaw);
    // Each product block is the text *before* its [NM-PDP:…] through that token (not after it).
    const prevMatch = refs[i - 1];
    const blockStart =
      i === 0 ? 0 : (prevMatch!.index ?? 0) + (prevMatch![0]?.length ?? 0);
    const blockEnd = match.index + match[0].length;
    const block = trimmed.slice(blockStart, blockEnd);

    const productName = block.match(PRODUCT_LINE_PATTERN)?.[1]?.trim() ?? null;
    const sku = block.match(SKU_LINE_PATTERN)?.[1]?.trim() ?? fromRef.sku ?? null;
    const quantityRaw = block.match(QTY_LINE_PATTERN)?.[1];
    const quantity = quantityRaw
      ? Number.parseInt(quantityRaw, 10)
      : fromRef.quantity ?? null;
    const productUrl = block.match(PRODUCT_URL_PATTERN)?.[0] ?? null;
    const sizeRaw = block.match(SIZE_LINE_PATTERN)?.[1]?.trim() ?? null;
    const colorRaw = block.match(COLOR_LINE_PATTERN)?.[1]?.trim() ?? null;
    const sizeLabel = sizeRaw && sizeRaw !== 'Sin seleccionar' ? sizeRaw : null;
    const colorLabel = colorRaw && colorRaw !== 'Sin seleccionar' ? colorRaw : null;
    const unitPrice = parseUnitPrice(block.match(PRICE_LINE_PATTERN)?.[1]?.trim() ?? null);

    intents.push({
      productName,
      sku,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      productUrl,
      productIdPrefix: fromRef.productIdPrefix ?? null,
      sizeLabel,
      colorLabel,
      unitPrice,
    });
  }

  return intents.filter((intent) => intent.productIdPrefix || intent.productName || intent.productUrl);
}

function parseSinglePdpPurchaseIntent(trimmed: string): ParsedPdpPurchaseIntent | null {
  const refMatch = trimmed.match(NM_PDP_REF_PATTERN);
  const fromRef = refMatch?.[1] ? parseRefToken(refMatch[1]) : {};


  const productName = trimmed.match(PRODUCT_LINE_PATTERN)?.[1]?.trim() ?? null;
  const sku = trimmed.match(SKU_LINE_PATTERN)?.[1]?.trim() ?? fromRef.sku ?? null;
  const quantityRaw = trimmed.match(QTY_LINE_PATTERN)?.[1];
  const quantity = quantityRaw
    ? Number.parseInt(quantityRaw, 10)
    : fromRef.quantity ?? null;
  const productUrl = trimmed.match(PRODUCT_URL_PATTERN)?.[0] ?? null;
  const sizeRaw = trimmed.match(SIZE_LINE_PATTERN)?.[1]?.trim() ?? null;
  const colorRaw = trimmed.match(COLOR_LINE_PATTERN)?.[1]?.trim() ?? null;
  const sizeLabel = sizeRaw && sizeRaw !== 'Sin seleccionar' ? sizeRaw : null;
  const colorLabel = colorRaw && colorRaw !== 'Sin seleccionar' ? colorRaw : null;
  const unitPrice = parseUnitPrice(trimmed.match(PRICE_LINE_PATTERN)?.[1]?.trim() ?? null);

  const hasPurchaseIntent =
    Boolean(refMatch)
    || (
      /\bquiero comprar este producto\b/i.test(trimmed)
      && Boolean(productName || productUrl)
    );

  if (!hasPurchaseIntent) {
    return null;
  }

  return {
    productName,
    sku,
    quantity: Number.isFinite(quantity) ? quantity : null,
    productUrl,
    productIdPrefix: fromRef.productIdPrefix ?? null,
    sizeLabel,
    colorLabel,
    unitPrice,
  };
}

export function mapPdpIntentToGuestCartItem(
  intent: ParsedPdpPurchaseIntent,
): WhatsAppGuestCartItemInput {
  const variation = [intent.sizeLabel, intent.colorLabel].filter(Boolean).join(' / ') || undefined;
  return {
    ...(intent.productIdPrefix ? { productIdPrefix: intent.productIdPrefix } : {}),
    ...(intent.sku ? { sku: intent.sku } : {}),
    name: intent.productName?.trim() || 'Producto WhatsApp',
    ...(variation ? { variation } : {}),
    ...(intent.productUrl ? { productUrl: intent.productUrl } : {}),
    quantity: intent.quantity && intent.quantity > 0 ? intent.quantity : 1,
    ...(intent.unitPrice != null ? { unitPrice: intent.unitPrice } : {}),
  };
}

export function buildPdpBatchPurchaseHandoffPrompt(itemCount: number): string {
  const n = Math.max(1, itemCount);
  const label = n === 1 ? 'un producto' : `${n} productos`;
  return (
    `¡Perfecto! Vi que quieres comprar *${label}* desde nuestra tienda online 🛍️\n\n` +
    '¿Te comunico con un asesor de Maritex para ayudarte a completar tu pedido por WhatsApp?'
  );
}

export function buildPdpPurchaseHandoffPrompt(intent: ParsedPdpPurchaseIntent): string {
  const label = intent.productName?.trim() || "el producto de la tienda";
  return (
    `¡Perfecto! Vi que quieres comprar *${label}* desde nuestra tienda online 🛍️\n\n` +
    '¿Te comunico con un asesor de Maritex para ayudarte a completar tu pedido por WhatsApp?'
  );
}
