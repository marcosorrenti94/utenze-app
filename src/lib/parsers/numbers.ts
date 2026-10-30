/** Utility di normalizzazione per numeri e date nel formato italiano. */

/** Importo con esattamente 2 decimali (es. 1.234,56 · -12,30 · 45,00). Evita i prezzi unitari con 4-6 decimali. */
export const AMOUNT_SRC = String.raw`-?\s?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)`;
/** Numero generico con decimali opzionali (es. 1.234 · 245,5 · 245). */
export const NUMBER_SRC = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?`;
export const DATE_SRC = String.raw`\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}`;

export const MONTHS_IT = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];
export const MONTH_SRC = `(${MONTHS_IT.join('|')}|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\\.?`;
const MONTH_NC_SRC = `(?:${MONTHS_IT.join('|')}|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\\.?`;
export const TEXT_DATE_SRC = String.raw`\d{1,2}\s+` + MONTH_NC_SRC + String.raw`\s+\d{4}`;

/** "1.234,56" → 1234.56 · "1234.56" → 1234.56 · "-12,30" → -12.3 */
export function parseItalianNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[€\s\u00a0]/g, '').trim();
  if (!s) return null;
  const negative = s.startsWith('-') || s.endsWith('-');
  s = s.replace(/-/g, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function monthIndex(token: string): number {
  const t = token.toLowerCase().replace('.', '');
  const idx = MONTHS_IT.findIndex((m) => m === t || m.startsWith(t));
  return idx;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "31/03/2026" · "31.03.26" · "1 marzo 2026" → "2026-03-31" (ISO). */
export function parseItalianDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = s.match(new RegExp(`^(\\d{1,2})\\s+${MONTH_SRC}\\s+(\\d{4})$`, 'i'));
  if (m) {
    const mi = monthIndex(m[2]);
    if (mi < 0) return null;
    return `${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}`;
  }
  return null;
}

/** "marzo 2026" → { start: 2026-03-01, end: 2026-03-31 } */
export function monthNameToRange(monthName: string, year: string | number): { start: string; end: string } | null {
  const mi = monthIndex(monthName);
  if (mi < 0) return null;
  const y = Number(year);
  const last = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
  return { start: `${y}-${pad(mi + 1)}-01`, end: `${y}-${pad(mi + 1)}-${pad(last)}` };
}

/** Mese di riferimento suggerito a partire dal periodo di fatturazione. */
export function suggestMonth(periodStart?: string | null, periodEnd?: string | null): string | null {
  if (periodStart && periodEnd) {
    const s = Date.parse(periodStart);
    const e = Date.parse(periodEnd);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      // Usa il mese che contiene la maggior parte del periodo (punto medio)
      const mid = new Date((s + e) / 2);
      return `${mid.getUTCFullYear()}-${pad(mid.getUTCMonth() + 1)}`;
    }
  }
  const one = periodStart ?? periodEnd;
  return one ? one.slice(0, 7) : null;
}
