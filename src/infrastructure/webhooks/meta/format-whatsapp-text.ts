/**
 * Meta WhatsApp text messages do not support Markdown.
 * Strip common markers and reshape tables/lists so replies render cleanly on mobile.
 */

function parseTableCells(line: string): string[] {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function isTableSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/** Converts markdown pipe tables into bullet lines: "• Concepto: Monto". */
function convertMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.includes('|')) {
      out.push(line);
      i++;
      continue;
    }

    const tableLines: string[] = [];
    while (i < lines.length && lines[i]!.includes('|')) {
      tableLines.push(lines[i]!);
      i++;
    }

    const rows = tableLines
      .map(parseTableCells)
      .filter((cells) => cells.length > 0 && !isTableSeparatorRow(cells));

    if (rows.length === 0) continue;

    const [header, ...body] = rows;
    const hasHeader = header && header.length >= 2 && body.length > 0;

    for (const row of hasHeader ? body : rows) {
      if (row.length < 2) {
        out.push(`• ${row.join(' ')}`);
        continue;
      }
      const label = row[0]!;
      const value = row.slice(1).join(' — ');
      out.push(`• ${label}: ${value}`);
    }
  }

  return out.join('\n');
}

export function formatWhatsAppText(text: string): string {
  let result = text
    // Fenced code blocks (including json wire format debris).
    .replace(/```[\s\S]*?```/g, '')
    // Horizontal rules.
    .replace(/^-{3,}\s*$/gm, '')
    .replace(/^_{3,}\s*$/gm, '')
    .replace(/^\*{3,}\s*$/gm, '')
    // Blockquotes.
    .replace(/^>\s?/gm, '')
    // Markdown links → label only.
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  result = convertMarkdownTables(result);

  return result
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/`(.+?)`/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    // Collapse excessive blank lines after cleanup.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Meta Cloud API expects digits only (country code + number, no +). */
export function toMetaRecipientId(e164: string): string {
  return e164.replace(/\D/g, '');
}
