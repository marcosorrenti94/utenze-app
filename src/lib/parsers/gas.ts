import { findPeriod, findTotal, firstNumber, mergePatterns, normalizeText } from './common';
import { suggestMonth } from './numbers';
import { detectProvider } from './providers';
import type { GasParseResult } from './types';

/** Estrae periodo, Smc e importo totale da una bolletta gas. Non lancia eccezioni. */
export function parseGasBill(rawText: string): GasParseResult {
  const text = normalizeText(rawText);
  const provider = detectProvider(text);
  const patterns = mergePatterns(provider);
  const extracted: string[] = [];

  const period = findPeriod(text, patterns);
  if (period.start) extracted.push('periodStart', 'periodEnd');

  const totalAmount = findTotal(text, patterns);
  if (totalAmount !== null) extracted.push('totalAmount');

  const smc = firstNumber(
    text.split('\n').filter((l) => !/annu|ultimi\s+12|storico|medi[oa]/i.test(l)).join('\n'),
    patterns.smc,
    (n) => n > 0 && n < 50_000,
  );
  if (smc !== null) extracted.push('smc');

  return {
    provider: provider?.name ?? null,
    periodStart: period.start,
    periodEnd: period.end,
    month: suggestMonth(period.start, period.end),
    smc,
    totalAmount,
    extracted,
    ok: totalAmount !== null || smc !== null,
  };
}
