import Handlebars from 'handlebars';
import { logger } from '../../shared/logger.js';

export interface TemplateCompileResult {
  rendered: string;
  missingVariables: string[];
}

const HANDLEBARS_BUILTINS = new Set([
  'if', 'unless', 'each', 'with', 'log', 'lookup', 'else',
  'blockHelperMissing', 'helperMissing',
]);

function collectAstVariables(node: unknown, found: Set<string>): void {
  if (!node || typeof node !== 'object') return;

  const n = node as Record<string, unknown>;

  if (
    (n['type'] === 'MustacheStatement' || n['type'] === 'SubExpression') &&
    typeof n['path'] === 'object'
  ) {
    const path = n['path'] as Record<string, unknown>;
    if (path['type'] === 'PathExpression' && typeof path['original'] === 'string') {
      if (!HANDLEBARS_BUILTINS.has(path['original'])) {
        found.add(path['original']);
      }
    }
  }

  if (n['type'] === 'BlockStatement') {
    const params = n['params'];
    if (Array.isArray(params)) {
      for (const p of params as Record<string, unknown>[]) {
        if (p['type'] === 'PathExpression' && typeof p['original'] === 'string') {
          found.add(p['original']);
        }
      }
    }
  }

  for (const key of Object.keys(n)) {
    const val = n[key];
    if (Array.isArray(val)) {
      for (const item of val) collectAstVariables(item, found);
    } else if (val && typeof val === 'object') {
      collectAstVariables(val, found);
    }
  }
}

function isAvailable(path: string, context: Record<string, unknown>): boolean {
  const parts = path.split('.');
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) return false;
  }
  return true;
}

/**
 * Compiles Handlebars templates with context validation and custom helpers.
 */
export class TemplateService {
  private readonly hbs: typeof Handlebars;

  constructor() {
    this.hbs = Handlebars.create();
    this.registerHelpers();
  }

  compile(template: string, context: Record<string, unknown>): TemplateCompileResult {
    const variablesInTemplate = new Set<string>();

    try {
      const ast = Handlebars.parse(template);
      collectAstVariables(ast, variablesInTemplate);
    } catch {
      throw new Error('Invalid Handlebars template: could not parse');
    }

    const missingVariables = [...variablesInTemplate].filter(
      (v) => !HANDLEBARS_BUILTINS.has(v) && !isAvailable(v, context),
    );

    if (missingVariables.length > 0) {
      logger.warn('[TemplateService] Missing variables in context', {
        missing: missingVariables,
      });
    }

    const compileFn = this.hbs.compile(template, { strict: false });
    let rendered: string;
    try {
      rendered = compileFn(context);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Handlebars render failed: ${detail}`);
    }

    return { rendered, missingVariables };
  }

  compileStrict(
    template: string,
    context: Record<string, unknown>,
    requiredVariables?: string[],
  ): string {
    const { rendered, missingVariables } = this.compile(template, context);

    if (requiredVariables) {
      const missingRequired = requiredVariables.filter((v) => missingVariables.includes(v));
      if (missingRequired.length > 0) {
        throw new Error(
          `Required template variables missing: ${missingRequired.join(', ')}`,
        );
      }
    } else if (missingVariables.length > 0) {
      throw new Error(
        `Template variables missing: ${missingVariables.join(', ')}`,
      );
    }

    return rendered;
  }

  private registerHelpers(): void {
    this.hbs.registerHelper('truncate', (str: unknown, len: unknown) => {
      if (typeof str !== 'string') return '';
      const limit = typeof len === 'number' ? len : 200;
      return str.length > limit ? `${str.substring(0, limit)}…` : str;
    });

    this.hbs.registerHelper('upper', (str: unknown) =>
      typeof str === 'string' ? str.toUpperCase() : '',
    );

    this.hbs.registerHelper('lower', (str: unknown) =>
      typeof str === 'string' ? str.toLowerCase() : '',
    );

    this.hbs.registerHelper('default', (val: unknown, fallback: unknown) =>
      val ?? fallback ?? '',
    );

    this.hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);

    this.hbs.registerHelper('join', (arr: unknown, sep: unknown) => {
      if (!Array.isArray(arr)) return '';
      const separator = typeof sep === 'string' ? sep : ', ';
      return arr.join(separator);
    });

    this.hbs.registerHelper('nl2br', (str: unknown) =>
      typeof str === 'string' ? str.replace(/\r?\n/g, '\n') : '',
    );
  }
}
