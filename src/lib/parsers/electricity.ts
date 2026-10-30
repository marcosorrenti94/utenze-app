import type { BillLine, ElecCategory } from '@/types';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/calc/defaults';
import { amountAfter, amountsIn, findPeriod, findTotal, firstNumber, mergePatterns, normalizeText } from './common';
import { parseDetailSection } from './detail';
import { suggestMonth } from './numbers';
import { detectProvider } from './providers';
import type { ElectricityParseResult, PatternSet, SectionKey } from './types';

interface HeadingHit {
  key: SectionKey;
  index: number;
  end: number;
}

function findHeadings(text: string, patterns: PatternSet): HeadingHit[] {
  const hits: HeadingHit[] = [];
  for (const key of Object.keys(patterns.sections) as SectionKey[]) {
    for (const p of patterns.sections[key]) {
      const g = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g');
      for (const m of text.matchAll(g)) {
        const index = m.index ?? 0;
        // Evita doppioni: se un'altra intestazione copre già la stessa posizione, salta
        if (hits.some((h) => index >= h.index && index < h.end)) continue;
        hits.push({ key, index, end: index + m[0].length });
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function sumQuotaLines(lines: string[], patterns: RegExp[]): number | null {
  let total = 0;
  let found = false;
  for (const line of lines) {
    if (!patterns.some((p) => p.test(line))) continue;
    const amounts = amountsIn(line);
    if (!amounts.length) continue;
    total += amounts[amounts.length - 1];
    found = true;
  }
  return found ? total : null;
}

interface SectionResult {
  total: number | null;
  fisso: number | null;
  potenza: number | null;
  energia: number | null;
}

function analyzeSection(text: string, hits: HeadingHit[], key: SectionKey, patterns: PatternSet): SectionResult {
  const own = hits.filter((h) => h.key === key);
  const result: SectionResult = { total: null, fisso: null, potenza: null, energia: null };
  if (!own.length) return result;

  // Totale della sezione: primo importo vicino alla prima intestazione utile
  for (const h of own) {
    const amount = amountAfter(text, h.end, 140);
    if (amount !== null) {
      result.total = amount;
      break;
    }
  }

  // Quote: cerca nelle finestre di ciascuna occorrenza (fino alla prossima intestazione)
  for (const h of own) {
    const next = hits.find((x) => x.index > h.index && x.key !== key);
    const window = text.slice(h.end, Math.min(next ? next.index : text.length, h.end + 2500));
    const lines = window.split('\n');
    const fisso = sumQuotaLines(lines, patterns.quotaFissa);
    const potenza = sumQuotaLines(lines, patterns.quotaPotenza);
    const energia = sumQuotaLines(lines, patterns.quotaEnergia);
    if (fisso !== null || potenza !== null || energia !== null) {
      result.fisso = fisso;
      result.potenza = potenza;
      result.energia = energia;
      if (result.total === null) {
        result.total = (fisso ?? 0) + (potenza ?? 0) + (energia ?? 0);
      }
      break;
    }
  }
  return result;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function newLine(category: ElecCategory, consumo: number, fisso: number, potenza: number): BillLine {
  return {
    id: crypto.randomUUID(),
    category,
    label: CATEGORY_LABELS[category],
    consumo: r2(consumo),
    fisso: r2(fisso),
    potenza: r2(potenza),
    vatExempt: category === 'rai',
  };
}

/** Linee predefinite (tutte a zero) per l'inserimento manuale. */
export function emptyElectricityLines(): BillLine[] {
  return CATEGORIES.map((c) => newLine(c, 0, 0, 0));
}

/**
 * Estrae i dati di una bolletta luce dal testo del PDF.
 * Non lancia mai eccezioni: in caso di fallimento restituisce campi null e ok = false.
 */
export function parseElectricityBill(rawText: string): ElectricityParseResult {
  const text = normalizeText(rawText);
  const provider = detectProvider(text);
  const patterns = mergePatterns(provider);
  const extracted: string[] = [];

  const period = findPeriod(text, patterns);
  if (period.start) extracted.push('periodStart', 'periodEnd');

  const totalAmount = findTotal(text, patterns);
  if (totalAmount !== null) extracted.push('totalAmount');

  const totalKwh = firstNumber(
    text.split('\n').filter((l) => !/annu|ultimi\s+12|storico|medi[oa]/i.test(l)).join('\n'),
    patterns.kwh,
    (n) => n > 0 && n < 100_000,
  );
  if (totalKwh !== null) extracted.push('totalKwh');

  // Tabella "Elementi di dettaglio": importi esatti per voce, verificati contro il totale da pagare
  const detail = parseDetailSection(text, totalAmount);
  if (detail) {
    for (const l of detail.lines) if (l.consumo || l.fisso || l.potenza) extracted.push(`line:${l.category}`);
    extracted.push('vatRate', 'vatAmount');
    return {
      provider: provider?.name ?? null,
      periodStart: period.start,
      periodEnd: period.end,
      month: suggestMonth(period.start, period.end),
      totalKwh,
      totalAmount,
      vatRate: detail.vatRate,
      vatAmount: detail.vatAmount,
      lines: detail.lines,
      extracted,
      ok: true,
    };
  }

  const vatRate = firstNumber(text, patterns.vatRate, (n) => n > 0 && n <= 22);
  if (vatRate !== null) extracted.push('vatRate');

  const hits = findHeadings(text, patterns);
  const lines: BillLine[] = [];

  for (const category of CATEGORIES) {
    const s = analyzeSection(text, hits, category, patterns);
    if (s.total === null || s.total === 0) {
      lines.push(newLine(category, 0, 0, 0));
      continue;
    }
    extracted.push(`line:${category}`);
    if (category === 'rai') {
      lines.push(newLine(category, 0, s.total, 0));
      continue;
    }
    const fisso = s.fisso ?? 0;
    const potenza = s.potenza ?? 0;
    // La quota a consumo è il residuo rispetto al totale di sezione, così le voci tornano sempre al totale
    const consumo = s.total - fisso - potenza;
    lines.push(newLine(category, consumo, fisso, potenza));
  }

  // IVA: preferisce "Totale IVA", poi la prima riga IVA con importo
  let vatAmount: number | null = null;
  const vatSection = analyzeSection(text, hits, 'iva', patterns);
  if (vatSection.total !== null && (totalAmount === null || vatSection.total < totalAmount)) {
    vatAmount = vatSection.total;
  }
  if (vatAmount === null) {
    for (const l of text.split('\n')) {
      if (!/\biva\b/i.test(l) || /partita\s+iva|p\.\s?iva|esente|imponibile|esclus/i.test(l)) continue;
      const a = amountsIn(l);
      if (a.length) {
        vatAmount = a[a.length - 1];
        break;
      }
    }
  }
  if (vatAmount !== null) extracted.push('vatAmount');

  const ok = totalAmount !== null || totalKwh !== null || lines.some((l) => l.consumo || l.fisso || l.potenza);
  return {
    provider: provider?.name ?? null,
    periodStart: period.start,
    periodEnd: period.end,
    month: suggestMonth(period.start, period.end),
    totalKwh,
    totalAmount,
    vatRate,
    vatAmount,
    lines,
    extracted,
    ok,
  };
}
