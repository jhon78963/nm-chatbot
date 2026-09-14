import type { Program } from '../../domain/entities/program.entity.js';
import { withCurrentDateContext } from '../../infrastructure/shared/current-date-context.js';

function botName(): string {
  return process.env['BOT_NAME'] ?? 'Malu';
}

function storeUrl(): string {
  return (process.env['STORE_URL'] ?? 'https://novedadesmaritex.net.pe').replace(/\/$/, '');
}

function buildBaseInstructions(): string {
  const name = botName();
  const store = storeUrl();

  return `Eres ${name}, la asistente virtual oficial de Maritex (Novedades Maritex), tienda de ropa en Perú. Tu objetivo es ayudar a los clientes a encontrar productos, responder dudas y conectarlos con un asesor humano cuando sea necesario. Responde de forma concisa, amable y en el mismo idioma que el usuario. Usa SOLO texto plano sin markdown porque el canal es WhatsApp.

Tienda online: ${store}

REGLAS:
- Usa el knowledge_base.md y los datos del catálogo como fuente de verdad.
- Nunca inventes precios, tallas, colores ni stock.
- Para precios y disponibilidad de productos específicos, usa las herramientas del catálogo.
- Cuando el cliente necesite atención humana (pedidos, reclamos, cambios, mayorista), responde ÚNICAMENTE con el token HANDOFF_TRIGGER sin texto adicional.
- No ofrezcas derivar a un asesor salvo que el cliente lo pida o aplique HANDOFF_TRIGGER.

PRIMER MENSAJE: Si es la primera interacción, envía el mensaje de bienvenida fijo con las 4 categorías (Niño, Joven, Señorita, Adulto mayor) según knowledge_base.md.`;
}

const MAX_PROMPT_CHARS = 40_000;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

/**
 * Builds supplemental system prompt context for conversations.
 * Primary bot knowledge lives in context/knowledge_base.md (hybrid chat).
 */
export class SystemPromptBuilderService {
  build(programs: Program[]): string {
    const base = buildBaseInstructions();

    if (programs.length === 0) {
      return withCurrentDateContext(base);
    }

    const blocks: string[] = [];
    let totalLen = base.length + 60;

    for (const p of programs) {
      const block = this.formatLegacyProgram(p);
      if (totalLen + block.length > MAX_PROMPT_CHARS) break;
      blocks.push(block);
      totalLen += block.length + 6;
    }

    return withCurrentDateContext(`${base}\n\n== CATÁLOGO (legacy) ==\n${blocks.join('\n---\n')}`);
  }

  /** @deprecated UPRIT programs — kept for Mongo transition only */
  private formatLegacyProgram(p: Program): string {
    const lines: string[] = [`[${p.name}]`];
    if (p.iaInformation) lines.push(truncate(p.iaInformation, 300));
    else if (p.summary) lines.push(truncate(p.summary, 250));
    if (p.brochureUrl) lines.push(`Enlace: ${p.brochureUrl}`);
    return lines.join('\n');
  }
}
