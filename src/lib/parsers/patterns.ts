import { AMOUNT_SRC, DATE_SRC, NUMBER_SRC, TEXT_DATE_SRC } from './numbers';
import type { PatternSet } from './types';

const A = `(${AMOUNT_SRC})`;
const N = `(${NUMBER_SRC})`;
const D = `(${DATE_SRC}|${TEXT_DATE_SRC})`;
const re = (src: string) => new RegExp(src, 'i');

/** Pattern generici, validi per la maggior parte delle bollette italiane (formato "Bolletta 2.0"). */
export const GENERIC_PATTERNS: PatternSet = {
  total: [
    re(String.raw`totale\s+(?:da\s+pagare|bolletta|fattura|documento|importo\s+da\s+pagare)[^\n]{0,60}?${A}`),
    re(String.raw`importo\s+(?:totale\s+)?(?:da\s+pagare|bolletta|fattura|a\s+debito)[^\n]{0,60}?${A}`),
    re(String.raw`totale\s+(?:€|euro)[^\n]{0,20}?${A}`),
    re(String.raw`da\s+pagare\s+entro[^\n]{0,60}?${A}`),
  ],
  kwh: [
    re(String.raw`(?:consum[oi]|energia)\s+(?:totale\s+|complessiv[oa]\s+)?(?:fatturat[oaie]|del\s+periodo|nel\s+periodo|complessiv[oa]|effettiv[oai]|rilevat[oai]|attiva\s+fatturata)[^\n]{0,60}?${N}\s*kwh`),
    re(String.raw`totale\s+(?:consum[oi]|energia(?:\s+attiva)?)[^\n]{0,40}?${N}\s*kwh`),
    re(String.raw`${N}\s*kwh\s+(?:fatturati|consumati|totali|nel\s+periodo)`),
  ],
  smc: [
    re(String.raw`(?:consum[oi]|gas)\s+(?:totale\s+|complessiv[oa]\s+)?(?:fatturat[oaie]|del\s+periodo|nel\s+periodo|complessiv[oa]|effettiv[oai]|rilevat[oai])[^\n]{0,60}?${N}\s*s?mc`),
    re(String.raw`totale\s+(?:consum[oi]|gas)[^\n]{0,40}?${N}\s*s?mc`),
    re(String.raw`${N}\s*smc\s+(?:fatturati|consumati|totali|nel\s+periodo)`),
  ],
  period: [
    re(String.raw`periodo(?:\s+di)?(?:\s+(?:fatturazione|riferimento|fornitura|consumo|competenza))?[^\n\d]{0,30}?${D}\s*(?:-|–|—|al|a|\/)\s*${D}`),
    re(String.raw`dal\s+${D}\s+al\s+${D}`),
    re(String.raw`${D}\s*(?:-|–|—)\s*${D}`),
  ],
  sections: {
    energia: [
      re(String.raw`spesa\s+(?:per\s+)?(?:la\s+)?materia\s+(?:prima\s+)?energia`),
      re(String.raw`servizi\s+di\s+vendita`),
      re(String.raw`materia\s+energia`),
    ],
    trasporto: [
      re(String.raw`spesa\s+(?:per\s+)?(?:il\s+)?trasporto(?:\s+e\s+(?:la\s+)?gestione\s+(?:del\s+)?contatore)?`),
      re(String.raw`servizi\s+di\s+rete`),
      re(String.raw`trasporto\s+e\s+gestione\s+(?:del\s+)?contatore`),
    ],
    oneri: [re(String.raw`spesa\s+(?:per\s+)?(?:gli\s+)?oneri\s+(?:generali\s+)?di\s+sistema`), re(String.raw`oneri\s+(?:generali\s+)?di\s+sistema`)],
    accise: [re(String.raw`\baccis[ae]\b`), re(String.raw`imposta\s+erariale(?:\s+di\s+consumo)?`), re(String.raw`imposte\s+(?:di\s+consumo|erariali)`)],
    rai: [re(String.raw`canone\s+(?:di\s+abbonamento\s+)?(?:alla\s+)?(?:televisione|tv|rai)`)],
    altre: [re(String.raw`altre\s+partite`), re(String.raw`\bconguagli?o?\b`), re(String.raw`ricalcol[oi]`)],
    iva: [re(String.raw`totale\s+iva`), re(String.raw`\biva\s+\d{1,2}\s*%`), re(String.raw`\biva\b(?!\s*esente)`)],
  },
  quotaFissa: [re(String.raw`quota\s+fissa`), re(String.raw`€\s*\/\s*(?:cliente\s*\/\s*)?mese`), re(String.raw`corrispettivo\s+fisso`)],
  quotaPotenza: [re(String.raw`quota\s+(?:di\s+)?potenza`), re(String.raw`€\s*\/\s*kw(?!h)`)],
  quotaEnergia: [re(String.raw`quota\s+(?:energia|variabile|consum[oi])`), re(String.raw`€\s*\/\s*kwh`)],
  vatRate: [re(String.raw`\biva\b[^\n%]{0,30}?(\d{1,2}(?:,\d+)?)\s*%`), re(String.raw`aliquota[^\n%]{0,20}?(\d{1,2}(?:,\d+)?)\s*%`)],
};
