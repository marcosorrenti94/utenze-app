import { GENERIC_PATTERNS } from './patterns';
import { AMOUNT_SRC, MONTH_SRC, monthNameToRange, parseItalianDate, parseItalianNumber } from './numbers';
import type { PatternSet, ProviderProfile, SectionKey } from './types';

/** Normalizza il testo estratto: spazi uniformi, righe pulite. */
export function normalizeText(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Unisce i pattern del fornitore (prioritari) con quelli generici. */
export function mergePatterns(provider: ProviderProfile | null): PatternSet {
  const p = provider?.patterns;
  if (!p) return GENERIC_PATTERNS;
  const sections = { ...GENERIC_PATTERNS.sections };
  if (p.sections) {
    for (const key of Object.keys(p.sections) as SectionKey[]) {
      sections[key] = [...(p.sections[key] ?? []), ...GENERIC_PATTERNS.sections[key]];
    }
  }
  return {
    total: [...(p.total ?? []), ...GENERIC_PATTERNS.total],
    kwh: [...(p.kwh ?? []), ...GENERIC_PATTERNS.kwh],
    smc: [...(p.smc ?? []), ...GENERIC_PATTERNS.smc],
    period: [...(p.period ?? []), ...GENERIC_PATTERNS.period],
    sections,
    quotaFissa: [...(p.quotaFissa ?? []), ...GENERIC_PATTERNS.quotaFissa],
    quotaPotenza: [...(p.quotaPotenza ?? []), ...GENERIC_PATTERNS.quotaPotenza],
    quotaEnergia: [...(p.quotaEnergia ?? []), ...GENERIC_PATTERNS.quotaEnergia],
    vatRate: [...(p.vatRate ?? []), ...GENERIC_PATTERNS.vatRate],
  };
}

/** Restituisce il gruppo 1 del primo pattern che trova una corrispondenza valida. */
export function firstNumber(text: string, patterns: RegExp[], accept: (n: number) => boolean = () => true): number | null {
  for (const p of patterns) {
    const global = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g');
    for (const m of text.matchAll(global)) {
      const n = parseItalianNumber(m[1]);
      if (n !== null && accept(n)) return n;
    }
  }
  return null;
}

/** Cerca il totale preferendo pattern espliciti; come ultima risorsa usa il primo importo dopo "totale". */
export function findTotal(text: string, patterns: PatternSet): number | null {
  return firstNumber(text, patterns.total, (n) => n > 0 && n < 100_000);
}

export function findPeriod(text: string, patterns: PatternSet): { start: string | null; end: string | null } {
  for (const p of patterns.period) {
    const m = text.match(p);
    if (m) {
      const start = parseItalianDate(m[1]);
      const end = parseItalianDate(m[2]);
      if (start && end && start <= end) return { start, end };
    }
  }
  // "periodo: marzo 2026" oppure "marzo 2026 - aprile 2026"
  const range = text.match(new RegExp(`${MONTH_SRC}\\s+(\\d{4})\\s*(?:-|–|al|a)\\s*${MONTH_SRC}\\s+(\\d{4})`, 'i'));
  if (range) {
    const a = monthNameToRange(range[1], range[2]);
    const b = monthNameToRange(range[3], range[4]);
    if (a && b) return { start: a.start, end: b.end };
  }
  const single = text.match(new RegExp(`(?:periodo|competenza|bolletta\\s+di)[^\\n\\d]{0,30}?${MONTH_SRC}\\s+(\\d{4})`, 'i'));
  if (single) {
    const r = monthNameToRange(single[1], single[2]);
    if (r) return r;
  }
  return { start: null, end: null };
}

/** Tutti gli importi (2 decimali) presenti in una stringa. */
export function amountsIn(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(new RegExp(AMOUNT_SRC, 'g'))) {
    const n = parseItalianNumber(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Primo importo che segue una posizione, entro una distanza massima. */
export function amountAfter(text: string, index: number, maxDistance = 140): number | null {
  const slice = text.slice(index, index + maxDistance);
  const found = amountsIn(slice);
  return found.length ? found[0] : null;
}
