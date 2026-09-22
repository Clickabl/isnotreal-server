export interface ParsedOfficialListRow {
  readonly rawName: string;
  readonly rawPayload: Readonly<Record<string, unknown>>;
}

const CCFP_NOTE_PREFIX = 'Note – The signers of this statement do so as individuals';

export function parseCcfpOctober2023Html(html: string): readonly ParsedOfficialListRow[] {
  if (typeof html !== 'string' || html.length < 1000 || html.length > 20 * 1024 * 1024)
    throw new Error('unexpected CCFP source size');

  const text = decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const start = text.findIndex((line) => line === 'SIGNED');
  const end = text.findIndex((line, index) => index > start && line.startsWith(CCFP_NOTE_PREFIX));
  if (start < 0 || end < 0 || end <= start + 1) {
    throw new Error('CCFP signer boundaries were not found; source structure changed');
  }

  const rows: ParsedOfficialListRow[] = [];
  for (const rawLine of text.slice(start + 1, end)) {
    if (rawLine.length < 2 || rawLine.length > 1000) continue;
    const rawName = rawLine.split(',')[0]?.trim() ?? '';
    if (!rawName || rawName.length > 300) continue;
    if (/^(previous post|next post|copyright|©)/i.test(rawName)) continue;
    rows.push({ rawName, rawPayload: { rawLine } });
  }

  if (rows.length < 1000) {
    throw new Error(`CCFP parser found only ${rows.length} signer rows; refusing partial import`);
  }
  return rows;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    ndash: '–',
    mdash: '—',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#x')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : whole;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : whole;
    }
    return named[entity.toLowerCase()] ?? whole;
  });
}
