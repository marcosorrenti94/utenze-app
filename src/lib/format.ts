const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const euroPrecise = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

/** 1234.56 → "1.234,56 €" (raggruppamento delle migliaia anche sotto 10.000) */
export function formatEuro(value: number | null | undefined): string {
  const v = Number.isFinite(value as number) ? (value as number) : 0;
  return withGrouping(euro.format(v));
}

/** Per i costi unitari (es. 0,2727 €/kWh) */
export function formatEuroPrecise(value: number | null | undefined): string {
  const v = Number.isFinite(value as number) ? (value as number) : 0;
  return withGrouping(euroPrecise.format(v));
}

// it-IT non raggruppa i numeri a 4 cifre (1234,56): forziamo "1.234,56"
function withGrouping(s: string): string {
  return s.replace(/(^|[-\s\u2212])(\d)(\d{3})(?=,|\s|$)/, '$1$2.$3');
}

export function formatNumber(value: number | null | undefined, digits?: number): string {
  if (!Number.isFinite(value as number)) return '—';
  const v = value as number;
  if (digits === 0) return withGrouping(num0.format(v));
  return withGrouping(num.format(v));
}

export function formatKwh(value: number | null | undefined): string {
  return Number.isFinite(value as number) ? `${formatNumber(value)} kWh` : '—';
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (!Number.isFinite(value as number)) return '—';
  const v = value as number;
  const s = new Intl.NumberFormat('it-IT', { maximumFractionDigits: digits, signDisplay: 'exceptZero' }).format(v);
  return `${s}%`;
}

/** "2026-03-31" → "31/03/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "2026-03" → "Marzo 2026" */
export function formatMonth(month: string | null | undefined, capitalize = true): string {
  if (!month) return '—';
  const [y, m] = month.split('-');
  const name = MONTHS[Number(m) - 1] ?? month;
  const s = `${name} ${y}`;
  return capitalize ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "2026-03" → "mar 26" */
export function formatMonthShort(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS_SHORT[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Interpreta un input decimale scritto con virgola o punto. */
export function parseDecimalInput(value: string): number {
  const s = value.trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s);
}

/** Formatta un numero per un campo di input (virgola decimale, senza separatore migliaia). */
export function toInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(Math.round(value * 10000) / 10000).replace('.', ',');
}
