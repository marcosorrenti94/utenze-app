import type { BillLine, ElecCategory, LineComponent } from '@/types';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/calc/defaults';
import { amountsIn } from './common';

/**
 * Lettura della tabella "Elementi di dettaglio" (formato Bolletta 2.0 / ARERA, usato ad es. da E.ON):
 *
 *   Totale Quota fissa € 9,09
 *   Totale Quota energia € 76,13
 *   Totale Spesa Energia € 85,22                       ← chiude la sezione "materia energia"
 *   Totale Quota fissa € 1,92 · Totale Quota potenza € 11,86 · Totale Quota variabile € 11,60
 *   Totale Spesa per il Trasporto e Gestione del Contatore € 25,38
 *   Totale Quota variabile € 26,11 · Totale Oneri di Sistema € 26,11
 *   Totale Imposte € 17,88 · Totale Altre Partite € -0,05
 *   IVA 10% su imponibile di € 154,59 € 15,46
 *
 * I subtotali "Totale Quota …" si accumulano finché una riga "Totale Spesa/Oneri/Imposte/Altre partite"
 * non li assegna alla categoria. Il risultato viene accettato solo se le voci + IVA + canone RAI
 * tornano al totale da pagare: altrimenti si ricade sul parser generico.
 */

export interface DetailParseResult {
  lines: BillLine[];
  vatRate: number;
  vatAmount: number;
}

type Pending = Record<LineComponent, number>;

const QUOTA = /^totale\s+quota\s+(fiss[ao]|energia|variabile|consum[oi]|potenza)\b/i;
const SECTION: [RegExp, ElecCategory][] = [
  [/^totale\s+spesa\s+per\s+(?:il\s+)?trasporto/i, 'trasporto'],
  [/^totale\s+(?:spesa\s+(?:per\s+(?:gli\s+)?)?)?oneri\s+(?:generali\s+)?di\s+sistema/i, 'oneri'],
  [/^totale\s+spesa\s+(?:per\s+(?:la\s+)?)?(?:materia\s+(?:prima\s+)?)?(?:energia|vendita)/i, 'energia'],
  [/^totale\s+imposte\b/i, 'accise'],
  [/^totale\s+altre\s+partite\b/i, 'altre'],
];
const VAT = /\biva\s+(\d{1,2}(?:,\d+)?)\s*%\s+su\s+imponibile\s+di\s+€?\s*(-?[\d.]+,\d{2})\s+€?\s*(-?[\d.]+,\d{2})/i;
const OUT_OF_SCOPE = /^(?:f\.?\s?c\.?|fuori\s+campo)[^\n]*?su\s+imponibile\s+di\s+€?\s*(-?[\d.]+,\d{2})/i;

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const lastAmount = (line: string): number | null => {
  const a = amountsIn(line);
  return a.length ? a[a.length - 1] : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseDetailSection(text: string, totalAmount: number | null): DetailParseResult | null {
  if (totalAmount === null) return null;
  // L'ultima occorrenza è l'intestazione della tabella: la frase compare anche prima, nella guida alla lettura
  // ("…consumati sono negli Elementi di dettaglio"), e da lì si conterebbero due volte i riepiloghi intermedi.
  const matches = [...text.matchAll(/elementi\s+di\s+dettaglio/gi)];
  if (!matches.length) return null;
  const start = matches[matches.length - 1].index ?? 0;
  const detail = text.slice(start).split('\n').map((l) => l.trim());

  const sums = Object.fromEntries(CATEGORIES.map((c) => [c, { consumo: 0, fisso: 0, potenza: 0 }])) as Record<ElecCategory, Pending>;
  let pending: Pending = { consumo: 0, fisso: 0, potenza: 0 };
  let pendingFound = false;
  let sectionsFound = 0;
  let vatAmount = 0;
  let vatTaxable = 0;
  let outOfScope = 0;

  for (const line of detail) {
    const quota = line.match(QUOTA);
    if (quota) {
      const amount = lastAmount(line);
      if (amount === null) continue;
      const kind = quota[1].toLowerCase();
      const comp: LineComponent = kind.startsWith('fiss') ? 'fisso' : kind === 'potenza' ? 'potenza' : 'consumo';
      pending[comp] += amount;
      pendingFound = true;
      continue;
    }
    const section = SECTION.find(([re]) => re.test(line));
    if (section) {
      const total = lastAmount(line);
      if (total === null) continue;
      const cat = section[1];
      const target = sums[cat];
      if (pendingFound && cat !== 'accise' && cat !== 'altre') {
        target.fisso += pending.fisso;
        target.potenza += pending.potenza;
        // Eventuali voci senza subtotale finiscono nella quota a consumo, così la sezione torna al suo totale
        target.consumo += total - pending.fisso - pending.potenza;
      } else {
        target.consumo += total;
      }
      pending = { consumo: 0, fisso: 0, potenza: 0 };
      pendingFound = false;
      sectionsFound++;
      continue;
    }
    const vat = line.match(VAT);
    if (vat) {
      vatTaxable += num(vat[2]);
      vatAmount += num(vat[3]);
      continue;
    }
    const oos = line.match(OUT_OF_SCOPE);
    if (oos) outOfScope += num(oos[1]);
  }
  if (sectionsFound < 2) return null;

  // Canone RAI: riga dedicata con l'importo (fuori dalla tabella di dettaglio in molte bollette)
  let rai = 0;
  for (const line of text.split('\n')) {
    if (!/^canone\s+(?:di\s+abbonamento|rai|tv)/i.test(line.trim())) continue;
    const amount = lastAmount(line);
    if (amount !== null && amount > 0) {
      rai = amount;
      break;
    }
  }
  sums.rai.fisso += rai;

  const lines: BillLine[] = CATEGORIES.map((category) => ({
    id: crypto.randomUUID(),
    category,
    label: CATEGORY_LABELS[category],
    consumo: r2(sums[category].consumo),
    fisso: r2(sums[category].fisso),
    potenza: r2(sums[category].potenza),
    // Canone RAI e partite fuori campo IVA (es. arrotondamenti) non entrano nell'imponibile
    vatExempt: category === 'rai' || (category === 'altre' && outOfScope !== 0 && Math.abs(outOfScope - sums.altre.consumo) < 0.01),
  }));

  const linesTotal = lines.reduce((s, l) => s + l.consumo + l.fisso + l.potenza, 0);
  if (Math.abs(linesTotal + vatAmount - totalAmount) > 0.05) return null;

  const vatRate = vatTaxable > 0 ? r2((vatAmount / vatTaxable) * 100) : 0;
  return { lines, vatRate, vatAmount: r2(vatAmount) };
}
