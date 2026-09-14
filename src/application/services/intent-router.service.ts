import type { AiProviderPort, ChatMessage } from '../ports/ai-provider.port.js';
import type { ProgramRepository } from '../../domain/repositories/program.repository.js';
import type { PromptRepository } from '../../domain/repositories/prompt.repository.js';
import type { FunnelIntentionRepository } from '../../domain/repositories/funnel-intention.repository.js';
import type { ContextSourceDataRepository } from '../../domain/repositories/context-source-data.repository.js';
import type { FacultyRepository } from '../../domain/repositories/faculty.repository.js';
import type { Message } from '../../domain/entities/message.entity.js';
import type { ConversationMetaData } from '../../domain/entities/conversation.entity.js';
import type { FunnelIntention } from '../../domain/entities/funnel-intention.entity.js';
import type { Prompt } from '../../domain/entities/prompt.entity.js';
import type { Program } from '../../domain/entities/program.entity.js';
import { TemplateService } from '../../infrastructure/ai/template/template.service.js';
import { logger } from '../../infrastructure/shared/logger.js';
import { withCurrentDateContext } from '../../infrastructure/shared/current-date-context.js';
import type { ProductToolsService } from '../../infrastructure/ai/tools/product-tools.service.js';
import { PRODUCT_TOOLS } from '../../infrastructure/ai/tools/product-tools.definitions.js';
import { completeWithTools } from '../../infrastructure/ai/tool-calling-loop.js';
import { parseStructuredAiResponse } from '../../infrastructure/ai/parse-structured-ai-response.js';

export interface IntentRoutingResult {
  content: string;
  model: string;
  totalTokens: number;
  newCareerId: string | null;
  newMetaData: ConversationMetaData | null;
  newProgramName: string | null;
  purchaseCategory: string | null;
}

/** Routing groups that can be forced from the bot menu (F8) without running Prompt 1. */
export type ForcedRoutingGroup = 'INFO_PROGRAM' | 'ADMISION';

/**
 * Prompts 4 (Categoría) and 5 (General) return JSON: {"message":"...","purchaseCategory":"..."}.
 * Delegates to the shared parser so multiline / fenced / noisy JSON never leaks to WhatsApp.
 */
function extractMessageAndCategory(raw: string): { message: string; purchaseCategory: string | null } {
  return parseStructuredAiResponse(raw);
}

// -----------------------------------------------------------------------
// Keyword matching helpers to identify the role of each intention by type
// -----------------------------------------------------------------------
const KEYWORDS: Record<string, string[]> = {
  IDENTIFY: ['IDENTIFICAR', 'IDENTIFY', 'INTENT', 'IDENTIFY_NEED'],
  INFO_PROGRAM: ['INFORMACION_PROGRAMA', 'INFORMACION_PROGRAMAS', 'INFO_PROGRAM', 'BRINDAR_INFORMACION', 'PROGRAM_INFO'],
  ADMISION: ['PROCESO_ADMISION', 'ADMISION', 'ADMISSION', 'PROCESO_ADMISIÓN'],
  CATEGORIA: ['PROGRAMAS_POR_CATEGORIA', 'CATEGORIA', 'CATEGORY', 'BY_CATEGORY'],
  // ASK_MORE_INFORMATION = actual type stored in DB for general-query intentions
  GENERAL: ['SOLICITAR_MAS_INFORMACION', 'GENERAL', 'FIRST_CONTACT', 'MAS_INFORMACION', 'PEDIR_MAS_INFORMACION', 'ASK_MORE_INFORMATION'],
  // GENERATE_SEARCH_QUERY = actual type stored in DB for embedding intentions
  EMBEDDING: ['GENERAR_QUERY', 'EMBEDDING', 'QUERY_EMBEDDING', 'GENERAR_QUERY_EMBEDDINGS', 'GENERATE_SEARCH_QUERY'],
  MULTIPLE: ['RESOLVER_DUDAS', 'MULTIPLE', 'VARIOS_PROGRAMAS', 'RESOLVER', 'MULTI'],
};

// Title-based hints for disambiguating intentions that share the same type string (e.g. PROVIDE_INFO).
// Keys map to routing groups; values are RegExps tested against the intention title.
const TITLE_GROUP_HINTS: Record<string, RegExp[]> = {
  ADMISION:     [/admisi/i, /proceso.*admis/i],
  CATEGORIA:    [/categor/i],
  INFO_PROGRAM: [/informac.*program/i, /informar.*program/i, /info.*carrera/i, /brindar.*info/i],
  GENERAL:      [/general/i, /m[aá]s informaci/i, /consulta general/i, /pedir/i],
  EMBEDDING:    [/embedding/i, /query/i, /reescrib/i, /b[uú]squeda/i],
  MULTIPLE:     [/m[uú]ltipl/i, /resolver.*duda/i, /varios.*program/i],
};

function matchesKeywords(type: string, group: string): boolean {
  const upper = type.toUpperCase();
  return (KEYWORDS[group] ?? []).some((kw) => upper === kw || upper.includes(kw) || kw.includes(upper));
}

function findIntentionByRole(intentions: FunnelIntention[], role: string): FunnelIntention | undefined {
  return intentions.find((i) => matchesKeywords(i.type, role));
}

function findPromptForIntention(prompts: Prompt[], intentionId: string): Prompt | undefined {
  return prompts.find((p) => p.intentionId === intentionId && p.active);
}

/**
 * Extended intention lookup that handles ambiguous types (e.g. multiple PROVIDE_INFO intentions).
 * Priority: (1) exact UUID match, (2) keyword match on type, (3) title-hint match on the linked prompt.
 */
function findIntentionForGroup(
  intentions: FunnelIntention[],
  prompts: Prompt[],
  role: string,
  preferredId?: string,
): FunnelIntention | undefined {
  if (preferredId) {
    const byId = intentions.find((i) => i.id === preferredId);
    if (byId) return byId;
  }
  const byRole = findIntentionByRole(intentions, role);
  if (byRole) return byRole;

  const hints = TITLE_GROUP_HINTS[role] ?? [];
  if (hints.length === 0) return undefined;

  for (const p of prompts) {
    if (!p.active) continue;
    if (hints.some((re) => re.test(p.title))) {
      const intention = intentions.find((i) => i.id === p.intentionId);
      if (intention) return intention;
    }
  }
  return undefined;
}

// -----------------------------------------------------------------------
// Message context builders
// -----------------------------------------------------------------------

/**
 * Converts the conversation Message array into the format expected by all prompt templates.
 * The last user message is marked as "por responder"; all others as "respondido".
 */
function buildMessagesContext(messages: ReadonlyArray<Message>): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') { lastUserIndex = i; break; }
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    result.push({
      role: m.role === 'assistant' ? 'bot' : m.role,
      text: m.content,
      isAnswered: i !== lastUserIndex,
    });
  }
  return result;
}

/** Parses the raw JSON string returned by Prompt 1 (intent detection). */
function extractIntentJson(raw: string): {
  intent: string;
  careerId: string | null;
  metaData: ConversationMetaData | null;
} | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0; let inStr = false; let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) {
      try {
        const obj = JSON.parse(raw.slice(start, i + 1)) as Record<string, unknown>;
        const intent = String(obj['intent'] ?? '').trim();
        const careerId = obj['careerId'] ? String(obj['careerId']).trim() : null;
        const md = obj['metaData'] as Record<string, unknown> | null | undefined;
        const metaData: ConversationMetaData | null = md
          ? {
              filterType: md['filterType'] ? String(md['filterType']) : null,
              filterValue: Array.isArray(md['filterValue'])
                ? (md['filterValue'] as unknown[]).map(String)
                : md['filterValue'] ? String(md['filterValue']) : null!,
            }
          : null;
        return { intent, careerId: careerId || null, metaData };
      } catch { return null; }
    }}
  }
  return null;
}

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

/**
 * Implements the 7-prompt intent routing pipeline described in the technical requirements.
 *
 * Flow:
 *  1. Run Prompt 1 (IDENTIFY INTENT) → get {intent, careerId, metaData}
 *  2. Route to the appropriate response prompt based on intent
 *  3. Build Handlebars context for that prompt
 *  4. Compile template + call DeepSeek
 *  5. Return result + updated intent context for the conversation
 *
 * If the prompts / intentions are not yet configured in the DB this service throws so
 * the caller (HandleIncomingMessageUseCase) can fall back to the monolithic system prompt.
 *
 * HYBRID ARCHITECTURE GUARDRAIL: every response-generating prompt (INFO_PROGRAM, ADMISION,
 * CATEGORIA, GENERAL, MULTIPLE) is executed through the shared tool-calling loop with
 * `academicToolsService` and gets `knowledgeBaseOverlay` appended to its DB-authored system
 * prompt. This means the model can NEVER invent a cost, malla curricular or vacancy figure —
 * it must call obtener_costo_carrera / obtener_informacion_carrera and answer with the hard
 * data returned from MongoDB, regardless of which Handlebars template (stored in the DB)
 * ends up being used for that turn.
 */
export class IntentRouterService {
  private readonly templateService: TemplateService;

  constructor(
    private readonly aiProvider: AiProviderPort,
    private readonly programRepo: ProgramRepository,
    private readonly promptRepo: PromptRepository,
    private readonly funnelIntentionRepo: FunnelIntentionRepository,
    private readonly contextSourceRepo: ContextSourceDataRepository,
    private readonly facultyRepo?: FacultyRepository,
    private readonly productToolsService?: ProductToolsService,
    private readonly knowledgeBaseOverlay?: string,
  ) {
    this.templateService = new TemplateService();
  }

  async route(params: {
    messages: ReadonlyArray<Message>;
    userMessage: string;
    careerId: string | null;
    metaData: ConversationMetaData | null;
    programName: string | null;
    isFirstMessage?: boolean;
  }): Promise<IntentRoutingResult> {
    const { messages, userMessage, careerId, metaData, programName, isFirstMessage } = params;

    // Load all DB data in parallel
    const [intentions, prompts, programs, faculties] = await Promise.all([
      this.funnelIntentionRepo.findActive(),
      this.promptRepo.findActive(),
      this.programRepo.findActive(),
      this.facultyRepo ? this.facultyRepo.findAll() : Promise.resolve([]),
    ]);

    if (intentions.length === 0) {
      throw new Error('[IntentRouter] No active funnel intentions in DB — cannot route');
    }
    if (prompts.length === 0) {
      throw new Error('[IntentRouter] No active prompts in DB — cannot route');
    }

    // ── Step 1: Identify intent ─────────────────────────────────────────
    const identifyIntention = findIntentionByRole(intentions, 'IDENTIFY');
    if (!identifyIntention) {
      throw new Error('[IntentRouter] IDENTIFY_INTENT intention not found in DB');
    }

    const identifyPrompt = findPromptForIntention(prompts, identifyIntention.id);
    if (!identifyPrompt) {
      throw new Error(`[IntentRouter] No prompt found for intention ${identifyIntention.id}`);
    }

    const intentContext = this.buildIdentifyContext(
      messages, userMessage, careerId, metaData, programs, intentions, isFirstMessage,
    );

    const compiledIdentify = this.templateService.compile(identifyPrompt.template, intentContext);
    logger.debug('[IntentRouter] Running intent detection', {
      missingVars: compiledIdentify.missingVariables,
    });

    const intentRaw = await this.aiProvider.complete([
      { role: 'system', content: compiledIdentify.rendered },
      { role: 'user', content: userMessage },
    ]);

    const parsed = extractIntentJson(intentRaw.content);
    if (!parsed || !parsed.intent) {
      throw new Error(`[IntentRouter] Could not parse intent JSON: ${intentRaw.content.slice(0, 200)}`);
    }

    logger.info('[IntentRouter] Intent detected', {
      intent: parsed.intent,
      careerId: parsed.careerId,
      metaData: parsed.metaData,
    });

    // Update context from the intent response (careerId takes priority from AI over previous)
    const newCareerId = parsed.careerId ?? careerId;
    const newMetaData = parsed.metaData ?? metaData;

    // ── Step 2: Find the matched intention ─────────────────────────────
    const matchedIntention = intentions.find(
      (i) => i.id === parsed.intent || i.type.toUpperCase() === parsed.intent.toUpperCase(),
    );

    // Determine routing group — pass prompts so PROVIDE_INFO can be disambiguated by title
    const routingGroup = this.resolveRoutingGroup(matchedIntention, parsed.intent, intentions, prompts);

    logger.info('[IntentRouter] Routing to group', { group: routingGroup, intention: matchedIntention?.type });

    // Safe text fallback — never expose raw AI JSON to the end user
    const textFallback = {
      content: 'En este momento no pude procesar esa consulta. Por favor escribe "menu" para ver las opciones disponibles o intenta con otras palabras.',
      model: intentRaw.model,
      totalTokens: intentRaw.totalTokens,
    };

    // ── Step 3: Route to the appropriate prompt ─────────────────────────
    // matchedIntention?.id is passed so handlers can use the exact UUID from the AI
    // response to find the right prompt, even when multiple intentions share the same type.
    let result: IntentRoutingResult;
    const matchedId = matchedIntention?.id;

    switch (routingGroup) {
      case 'INFO_PROGRAM':
        result = await this.handleInfoProgram(messages, userMessage, newCareerId, programs, prompts, intentions, textFallback, matchedId);
        break;
      case 'ADMISION':
        result = await this.handleAdmision(messages, userMessage, newCareerId, programs, prompts, intentions, textFallback, matchedId);
        break;
      case 'CATEGORIA':
        result = await this.handleCategoria(messages, userMessage, newMetaData, programs, prompts, intentions, textFallback, matchedId);
        break;
      case 'GENERAL':
        result = await this.handleGeneral(messages, userMessage, faculties, programs, prompts, intentions, textFallback, isFirstMessage, matchedId);
        break;
      case 'EMBEDDING':
      case 'MULTIPLE':
        result = await this.handleEmbeddingSearch(messages, userMessage, programName, programs, prompts, intentions, textFallback);
        break;
      default:
        logger.warn('[IntentRouter] Unknown routing group, falling back to GENERAL', { group: routingGroup });
        result = await this.handleGeneral(messages, userMessage, faculties, programs, prompts, intentions, textFallback, isFirstMessage);
    }

    return {
      ...result,
      newCareerId,
      newMetaData,
    };
  }

  /**
   * F8 — Skip intent detection (Prompt 1) and route directly to a known handler.
   * Used when the user picks a menu list item with a predefined mapping.
   */
  async routeForced(params: {
    messages: ReadonlyArray<Message>;
    userMessage: string;
    careerId: string | null;
    metaData: ConversationMetaData | null;
    programName: string | null;
    forcedGroup: ForcedRoutingGroup;
  }): Promise<IntentRoutingResult> {
    const { messages, userMessage, careerId, metaData, programName, forcedGroup } = params;

    const [intentions, prompts, programs, faculties] = await Promise.all([
      this.funnelIntentionRepo.findActive(),
      this.promptRepo.findActive(),
      this.programRepo.findActive(),
      this.facultyRepo ? this.facultyRepo.findAll() : Promise.resolve([]),
    ]);

    const fallback = {
      content: 'Lo siento, no pude obtener esa información en este momento. Escribe "menu" para ver otras opciones.',
      model: 'menu-forced',
      totalTokens: 0,
    };

    let result: IntentRoutingResult;

    switch (forcedGroup) {
      case 'INFO_PROGRAM':
        result = await this.handleInfoProgram(
          messages, userMessage, careerId, programs, prompts, intentions, fallback,
        );
        break;
      case 'ADMISION':
        result = await this.handleAdmision(
          messages, userMessage, careerId, programs, prompts, intentions, fallback,
        );
        break;
      default:
        result = this.fallbackResult(fallback);
    }

    return {
      ...result,
      newCareerId: careerId,
      newMetaData: metaData,
      newProgramName: programName,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Routing handlers
  // ─────────────────────────────────────────────────────────────────────────

  private async handleInfoProgram(
    messages: ReadonlyArray<Message>,
    userMessage: string,
    careerId: string | null,
    programs: Program[],
    prompts: Prompt[],
    intentions: FunnelIntention[],
    fallback: { content: string; model: string; totalTokens: number },
    matchedIntentionId?: string,
  ): Promise<IntentRoutingResult> {
    const intention = findIntentionForGroup(intentions, prompts, 'INFO_PROGRAM', matchedIntentionId);
    const prompt = intention ? findPromptForIntention(prompts, intention.id) : undefined;
    if (!prompt) return this.fallbackResult(fallback);

    const fullText = await this.getFullTextContent(careerId, programs);
    const ctx = this.buildProgramResponseContext(messages, fullText);
    return this.compileAndCall(prompt.template, ctx, userMessage, fallback, null);
  }

  private async handleAdmision(
    messages: ReadonlyArray<Message>,
    userMessage: string,
    careerId: string | null,
    programs: Program[],
    prompts: Prompt[],
    intentions: FunnelIntention[],
    fallback: { content: string; model: string; totalTokens: number },
    matchedIntentionId?: string,
  ): Promise<IntentRoutingResult> {
    const intention = findIntentionForGroup(intentions, prompts, 'ADMISION', matchedIntentionId);
    const prompt = intention ? findPromptForIntention(prompts, intention.id) : undefined;
    if (!prompt) return this.fallbackResult(fallback);

    const fullText = await this.getFullTextContent(careerId, programs);
    const ctx = this.buildProgramResponseContext(messages, fullText);
    return this.compileAndCall(prompt.template, ctx, userMessage, fallback, null);
  }

  private async handleCategoria(
    messages: ReadonlyArray<Message>,
    userMessage: string,
    metaData: ConversationMetaData | null,
    programs: Program[],
    prompts: Prompt[],
    intentions: FunnelIntention[],
    fallback: { content: string; model: string; totalTokens: number },
    matchedIntentionId?: string,
  ): Promise<IntentRoutingResult> {
    const intention = findIntentionForGroup(intentions, prompts, 'CATEGORIA', matchedIntentionId);
    const prompt = intention ? findPromptForIntention(prompts, intention.id) : undefined;
    if (!prompt) return this.fallbackResult(fallback);

    const filterValue = metaData?.filterValue ?? null;
    const filterType = metaData?.filterType ?? null;

    const filteredPrograms = filterType && filterValue
      ? programs.filter((p) => this.programMatchesFilter(p, filterType, filterValue))
      : programs;

    const lastUserMessages = messages.filter((m) => m.role === 'user').slice(-1);
    const ctx: Record<string, unknown> = {
      messages: buildMessagesContext(messages),
      lastUserMessage: lastUserMessages.map((m) => ({ text: m.content })),
      metadata: {
        filterValue: Array.isArray(filterValue) ? filterValue.join(', ') : (filterValue ?? ''),
      },
      careers: filteredPrograms.map((p) => ({
        name: p.name,
        modalities: p.modalities.map((mod) => ({
          careerType: mod.careerType,
          modalities: mod.modalities,
        })),
      })),
    };
    return this.compileAndCallWithCategory(prompt.template, ctx, userMessage, fallback, null);
  }

  private async handleGeneral(
    messages: ReadonlyArray<Message>,
    userMessage: string,
    faculties: Array<{ id: string; name: string; description: string; slug: string; type: string }>,
    programs: Program[],
    prompts: Prompt[],
    intentions: FunnelIntention[],
    fallback: { content: string; model: string; totalTokens: number },
    isFirstMessage = false,
    matchedIntentionId?: string,
  ): Promise<IntentRoutingResult> {
    const intention = findIntentionForGroup(intentions, prompts, 'GENERAL', matchedIntentionId);
    const prompt = intention ? findPromptForIntention(prompts, intention.id) : undefined;
    if (!prompt) return this.fallbackResult(fallback);

    const lastUserMessages = messages.filter((m) => m.role === 'user').slice(-1);
    const ctx: Record<string, unknown> = {
      isFirstMessage,
      messages: buildMessagesContext(messages),
      lastUserMessage: lastUserMessages.map((m) => ({ text: m.content })),
      faculties: faculties.map((f) => ({ id: f.id, name: f.name, description: f.description })),
      // Expose all programs so the prompt can list available study levels on first contact
      careers: programs.map((p) => ({
        name: p.name,
        modalities: p.modalities.map((mod) => ({
          careerType: mod.careerType,
          modalities: mod.modalities,
        })),
      })),
    };
    return this.compileAndCallWithCategory(prompt.template, ctx, userMessage, fallback, null);
  }

  private async handleEmbeddingSearch(
    messages: ReadonlyArray<Message>,
    userMessage: string,
    programName: string | null,
    programs: Program[],
    prompts: Prompt[],
    intentions: FunnelIntention[],
    fallback: { content: string; model: string; totalTokens: number },
  ): Promise<IntentRoutingResult> {
    // Step 1: Run Prompt 6 (embedding query generator)
    const embIntention = findIntentionForGroup(intentions, prompts, 'EMBEDDING');
    const embPrompt = embIntention ? findPromptForIntention(prompts, embIntention.id) : undefined;

    let searchQuery = userMessage;
    let resolvedProgramName = programName;

    if (embPrompt) {
      const embCtx: Record<string, unknown> = {
        session: { programName: programName ?? '' },
        careers: programs.map((p) => ({ name: p.name })),
        messages: buildMessagesContext(messages),
      };
      const compiledEmb = this.templateService.compile(embPrompt.template, embCtx);
      const embRaw = await this.aiProvider.complete([
        { role: 'system', content: compiledEmb.rendered },
        { role: 'user', content: userMessage },
      ]);

      const rawQuery = embRaw.content.trim();

      // Detect handoff trigger inside Prompt 6 response
      if (rawQuery === 'HANDOFF_TRIGGER') {
        return { content: 'HANDOFF_TRIGGER', model: embRaw.model, totalTokens: embRaw.totalTokens, newCareerId: null, newMetaData: null, newProgramName: null, purchaseCategory: null };
      }

      // Parse the query format: "[PROGRAM_NAME] | [SEMANTIC_QUERY]" or just "[SEMANTIC_QUERY]"
      const pipeIdx = rawQuery.indexOf('|');
      if (pipeIdx !== -1) {
        resolvedProgramName = rawQuery.slice(0, pipeIdx).trim() || programName;
        searchQuery = rawQuery.slice(pipeIdx + 1).trim();
      } else {
        searchQuery = rawQuery;
      }
    }

    // Step 2: Search context_source_data
    let contextDocs = await this.contextSourceRepo.searchByText(searchQuery, 5);

    // If a specific program name was identified, also try to fetch its content
    if (resolvedProgramName && contextDocs.length === 0) {
      const byName = await this.contextSourceRepo.findByProgramName(resolvedProgramName);
      if (byName) contextDocs = [byName];
    }

    // Step 3: Run Prompt 7 (multiple programs response)
    const multiIntention = findIntentionForGroup(intentions, prompts, 'MULTIPLE');
    const multiPrompt = multiIntention ? findPromptForIntention(prompts, multiIntention.id) : undefined;

    if (!multiPrompt || contextDocs.length === 0) {
      return this.fallbackResult(fallback);
    }

    // Build programs context from search results + program metadata
    const foundPrograms = contextDocs.map((doc) => {
      const prog = programs.find((p) => p.id === doc.originalId || p.name === doc.programName);
      return {
        name: doc.programName,
        summary: prog?.summary ?? doc.fullTextContent.slice(0, 300),
        modalities: prog?.modalities.map((mod) => ({
          careerType: mod.careerType,
          modalities: mod.modalities,
        })) ?? [],
      };
    });

    const multiCtx: Record<string, unknown> = {
      messages: buildMessagesContext(messages),
      programs: foundPrograms,
    };

    const newProgramName = resolvedProgramName ?? (foundPrograms[0]?.name ?? null);
    const multiResult = await this.compileAndCall(multiPrompt.template, multiCtx, userMessage, fallback, newProgramName);
    return { ...multiResult, newProgramName };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildIdentifyContext(
    messages: ReadonlyArray<Message>,
    _userMessage: string,
    careerId: string | null,
    metaData: ConversationMetaData | null,
    programs: Program[],
    intentions: FunnelIntention[],
    isFirstMessage = false,
  ): Record<string, unknown> {
    return {
      isFirstMessage,
      user: {
        careerId: careerId ?? null,
        metaData: metaData
          ? {
              filterType: metaData.filterType ?? null,
              filterValue: Array.isArray(metaData.filterValue)
                ? metaData.filterValue
                : metaData.filterValue ? [metaData.filterValue] : [],
            }
          : { filterType: null, filterValue: [] },
      },
      careers: programs.map((p) => ({
        id: p.id,
        name: p.name,
        modalities: p.modalities.map((mod) => ({
          careerType: mod.careerType,
          modalities: mod.modalities,
        })),
        facultyId: p.facultyId,
        faculty: { name: '' },
        tags: p.tags,
      })),
      messages: buildMessagesContext(messages),
      intentions: intentions.map((i) => ({ id: i.id, title: i.title, description: i.description })),
    };
  }

  private buildProgramResponseContext(
    messages: ReadonlyArray<Message>,
    fullTextContent: string,
  ): Record<string, unknown> {
    return {
      messages: buildMessagesContext(messages),
      program: { full_text_content: fullTextContent },
    };
  }

  private async getFullTextContent(careerId: string | null, programs: Program[]): Promise<string> {
    if (careerId) {
      const csd = await this.contextSourceRepo.findByProgramId(careerId);
      if (csd) return csd.fullTextContent;
      // Fall back to finding by program name if careerId not in context_source_data
      const prog = programs.find((p) => p.id === careerId);
      if (prog) {
        const csdByName = await this.contextSourceRepo.findByProgramName(prog.name);
        if (csdByName) return csdByName.fullTextContent;
      }
    }
    // No specific program identified — return a general summary of all programs
    return programs
      .slice(0, 10)
      .map((p) => `${p.name}: ${p.summary}`)
      .join('\n\n');
  }

  /** For plain-text responding prompts (2, 3, 7). */
  private async compileAndCall(
    template: string,
    ctx: Record<string, unknown>,
    userMessage: string,
    fallback: { content: string; model: string; totalTokens: number },
    newProgramName: string | null,
  ): Promise<IntentRoutingResult> {
    const result = await this.runPrompt(template, ctx, userMessage, fallback);
    if (!result) return this.fallbackResult(fallback);
    return {
      content: result.content,
      model: result.model,
      totalTokens: result.totalTokens,
      newCareerId: null,
      newMetaData: null,
      newProgramName,
      purchaseCategory: null,
    };
  }

  /** For JSON-responding prompts (4, 5) that return {message, purchaseCategory}. */
  private async compileAndCallWithCategory(
    template: string,
    ctx: Record<string, unknown>,
    userMessage: string,
    fallback: { content: string; model: string; totalTokens: number },
    newProgramName: string | null,
  ): Promise<IntentRoutingResult> {
    const result = await this.runPrompt(template, ctx, userMessage, fallback);
    if (!result) return this.fallbackResult(fallback);
    const { message, purchaseCategory } = extractMessageAndCategory(result.content);
    return {
      content: message,
      model: result.model,
      totalTokens: result.totalTokens,
      newCareerId: null,
      newMetaData: null,
      newProgramName,
      purchaseCategory,
    };
  }

  private async runPrompt(
    template: string,
    ctx: Record<string, unknown>,
    userMessage: string,
    fallback: { content: string; model: string; totalTokens: number },
  ): Promise<{ content: string; model: string; totalTokens: number } | null> {
    let compiled: { rendered: string; missingVariables: string[] };
    try {
      compiled = this.templateService.compile(template, ctx);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn('[IntentRouter] Template compilation failed — falling back to hybrid chat', {
        error: detail,
      });
      return null;
    }
    if (compiled.missingVariables.length > 0) {
      logger.warn('[IntentRouter] Missing template variables', { missing: compiled.missingVariables });
    }

    // Overlay the static knowledge base + strict anti-hallucination rule on top of the
    // DB-authored (Handlebars) prompt — never replace the marketing/behavior instructions,
    // only reinforce them with the single source of truth for facts + tool-usage rules.
    const systemContent = withCurrentDateContext(
      this.knowledgeBaseOverlay
        ? `${compiled.rendered}\n\n${this.knowledgeBaseOverlay}`
        : compiled.rendered,
    );

    const msgs: ChatMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage },
    ];

    if (!this.productToolsService) {
      return this.aiProvider.complete(msgs);
    }

    return completeWithTools(this.aiProvider, msgs, PRODUCT_TOOLS, (name, args) =>
      this.productToolsService!.execute(name, args),
    );
  }

  private fallbackResult(r: { content: string; model: string; totalTokens: number }): IntentRoutingResult {
    return { ...r, newCareerId: null, newMetaData: null, newProgramName: null, purchaseCategory: null };
  }

  private resolveRoutingGroup(
    intention: FunnelIntention | undefined,
    rawIntent: string,
    _intentions: FunnelIntention[],
    prompts: Prompt[] = [],
  ): string {
    const typeStr = intention?.type ?? rawIntent;
    for (const group of Object.keys(KEYWORDS)) {
      if (matchesKeywords(typeStr, group)) return group;
    }
    // Disambiguate by the title of the prompt linked to this specific intention UUID.
    // Handles cases where multiple intentions share the same type (e.g. PROVIDE_INFO).
    if (intention) {
      const linkedPrompt = prompts.find((p) => p.intentionId === intention.id && p.active);
      if (linkedPrompt) {
        for (const [group, hints] of Object.entries(TITLE_GROUP_HINTS)) {
          if (hints.some((re) => re.test(linkedPrompt.title))) return group;
        }
      }
    }
    // Try matching raw intent string against keywords
    for (const group of Object.keys(KEYWORDS)) {
      if ((KEYWORDS[group] ?? []).some((kw) => rawIntent.toUpperCase().includes(kw))) return group;
    }
    return 'GENERAL';
  }

  private programMatchesFilter(
    program: Program,
    filterType: string,
    filterValue: string | string[],
  ): boolean {
    const values = Array.isArray(filterValue) ? filterValue : [filterValue];
    const lType = filterType.toLowerCase();

    if (lType === 'facultyid') {
      return values.includes(program.facultyId);
    }
    if (lType === 'types' || lType === 'type') {
      return (program.types as string[]).some((t) => values.includes(t));
    }
    if (lType === 'modalities' || lType === 'modality') {
      const flatModalities = program.modalities.flatMap((m) => m.modalities as string[]);
      return flatModalities.some((m) => values.includes(m));
    }
    if (lType === 'tags' || lType === 'tag') {
      return (program.tags as string[]).some((t) => values.includes(t));
    }
    return false;
  }
}
