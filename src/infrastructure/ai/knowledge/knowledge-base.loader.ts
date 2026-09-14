import { readFileSync } from 'node:fs';
import path from 'node:path';
import { logger } from '../../shared/logger.js';

/** Resolves the knowledge base path from KNOWLEDGE_BASE_PATH, defaulting to "<cwd>/context/knowledge_base.md". */
export function resolveKnowledgeBasePath(): string {
  return process.env['KNOWLEDGE_BASE_PATH'] ?? path.join(process.cwd(), 'context', 'knowledge_base.md');
}

/**
 * Appended after the static knowledge base to enforce the hybrid architecture:
 * static facts come from the file, but anything dynamic (costs, curriculum,
 * vacancies) MUST come from a tool call — never from the model's own knowledge.
 */
const TOOL_USAGE_ADDENDUM = `
───────────────────────────────────────────────────────────
REGLAS DE HERRAMIENTAS (TOOL CALLING) — LECTURA OBLIGATORIA
───────────────────────────────────────────────────────────
Eres Malu, asistente de Maritex. Para precios, stock y detalles de productos
específicos, NO inventes: usa "obtener_precio_producto", "obtener_informacion_producto"
o "buscar_productos" y responde solo con los datos devueltos.

- Si el producto no existe o no hay dato registrado, no inventes precios ni tallas.
- Si la herramienta reporta error técnico, responde EXCLUSIVAMENTE con HANDOFF_TRIGGER.
- NUNCA simules la derivación a un asesor con texto; el sistema usa HANDOFF_TRIGGER.
- Invoca herramientas directamente cuando la pregunta requiere precio, stock o catálogo.

RECOMENDACIONES DE CATÁLOGO (después de buscar_productos o obtener_informacion_producto):
- Muestra como máximo 3 productos con nombre, precio referencial y urlTienda/enlace en texto plano.
- Cierra SIEMPRE con una pregunta: "¿Cuál te interesa?" o "¿Te gustaría que lo agregue a tu carrito?".
- Si el cliente confirma que quiere un producto, usa agregar_al_carrito_whatsapp (pide talla si hay varias).
- Si pregunta qué lleva en el carrito, usa consultar_carrito_whatsapp.
- Solo deriva a asesor (HANDOFF_TRIGGER o confirmación de compra) cuando haya intención clara de cerrar pedido,
  no al mostrar opciones.

CARRITO WHATSAPP:
- agregar_al_carrito_whatsapp guarda la selección 24 h sin login.
- Tras agregar, resume cuántos ítems lleva y pregunta si desea seguir comprando o armar el pedido.

───────────────────────────────────────────────────────────
FORMATO WHATSAPP — LECTURA OBLIGATORIA
───────────────────────────────────────────────────────────
El canal es WhatsApp: sin tablas, markdown ni bloques de código.
Usa listas con viñetas en texto plano para precios y tallas.

Ejemplo:
Polo básico — Niño
• Talla 6: S/ 35 (disponible)
• Talla 8: S/ 35 (agotado)
Ver más: https://novedadesmaritex.net.pe/producto/...

Mantén respuestas concisas y fáciles de leer en celular.
`;

let cachedKnowledgeBase: string | null = null;

/**
 * Reads the static knowledge base file once and caches it in memory.
 * Falls back to a minimal safe prompt if the file is missing/unreadable,
 * so a misconfigured deployment never crashes the chat engine.
 */
export function loadKnowledgeBase(filePath: string): string {
  if (cachedKnowledgeBase !== null) return cachedKnowledgeBase;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    cachedKnowledgeBase = `${raw.trim()}\n${TOOL_USAGE_ADDENDUM}`;
    logger.info('[KnowledgeBase] Loaded static knowledge base', {
      filePath,
      chars: raw.length,
    });
  } catch (err) {
    logger.error('[KnowledgeBase] Failed to load knowledge base file — using minimal fallback', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    cachedKnowledgeBase =
      'Eres Malu, asistente virtual de Maritex (Novedades Maritex). La base de conocimiento no está ' +
      'disponible en este momento; usa herramientas del catálogo para precios y deriva con HANDOFF_TRIGGER ' +
      'ante pedidos, reclamos o consultas que no puedas verificar.' + TOOL_USAGE_ADDENDUM;
  }

  return cachedKnowledgeBase;
}

/** Test-only helper: clears the in-memory cache so the file can be reloaded. */
export function clearKnowledgeBaseCache(): void {
  cachedKnowledgeBase = null;
}
