import { describe, expect, it } from 'vitest';
import { parseElectricityBill } from './electricity';
import { parseGasBill } from './gas';
import { parseItalianDate, parseItalianNumber } from './numbers';

const SAMPLE_LUCE = `Enel Energia S.p.A.
BOLLETTA DELLA LUCE
Periodo di fatturazione: 01/03/2026 - 31/03/2026
Totale da pagare 141,01 €
Consumo fatturato nel periodo 300 kWh
Consumo annuo 2.750 kWh
SINTESI DEGLI IMPORTI FATTURATI
Spesa per la materia energia 72,00 €
Spesa per il trasporto e la gestione del contatore 22,20 €
Spesa per oneri di sistema 19,00 €
Accise 6,81 €
IVA 10% 12,00 €
Canone di abbonamento alla televisione 9,00 €
DETTAGLIO
Spesa per la materia energia
Quota fissa 1 mese 12,000000 €/cliente/mese 12,00
Quota energia 300 kWh 0,200000 €/kWh 60,00
Spesa per il trasporto e la gestione del contatore
Quota fissa 1 mese 6,00
Quota potenza 3 kW 7,20
Quota energia 300 kWh 9,00
Spesa per oneri di sistema
Quota fissa 4,00
Quota energia 300 kWh 15,00
`;

describe('parser numeri e date', () => {
  it('numeri italiani', () => {
    expect(parseItalianNumber('1.234,56')).toBe(1234.56);
    expect(parseItalianNumber('-12,30')).toBe(-12.3);
    expect(parseItalianNumber('2.750')).toBe(2750);
  });
  it('date italiane', () => {
    expect(parseItalianDate('31/03/2026')).toBe('2026-03-31');
    expect(parseItalianDate('1 marzo 2026')).toBe('2026-03-01');
    expect(parseItalianDate('05.04.26')).toBe('2026-04-05');
  });
});

describe('parseElectricityBill', () => {
  const res = parseElectricityBill(SAMPLE_LUCE);
  it('riconosce fornitore, periodo, totale e kWh', () => {
    expect(res.provider).toBe('Enel Energia');
    expect(res.periodStart).toBe('2026-03-01');
    expect(res.periodEnd).toBe('2026-03-31');
    expect(res.month).toBe('2026-03');
    expect(res.totalAmount).toBe(141.01);
    expect(res.totalKwh).toBe(300);
    expect(res.vatRate).toBe(10);
    expect(res.vatAmount).toBe(12);
  });
  it('separa quota fissa, potenza e consumo', () => {
    const energia = res.lines.find((l) => l.category === 'energia');
    const trasporto = res.lines.find((l) => l.category === 'trasporto');
    const rai = res.lines.find((l) => l.category === 'rai');
    expect(energia?.fisso).toBe(12);
    expect(energia?.consumo).toBe(60);
    expect(trasporto?.potenza).toBe(7.2);
    expect(trasporto?.fisso).toBe(6);
    expect(trasporto?.consumo).toBe(9);
    expect(rai?.fisso).toBe(9);
    expect(rai?.vatExempt).toBe(true);
  });
  it('testo vuoto: nessuna eccezione, ok = false', () => {
    const empty = parseElectricityBill('');
    expect(empty.ok).toBe(false);
    expect(empty.totalAmount).toBeNull();
  });
});

describe('parseGasBill', () => {
  it('estrae periodo, Smc e importo', () => {
    const res = parseGasBill(`Hera Comm\nPeriodo dal 01/02/2026 al 28/02/2026\nConsumo fatturato 112 Smc\nImporto da pagare 87,40 €`);
    expect(res.smc).toBe(112);
    expect(res.totalAmount).toBe(87.4);
    expect(res.month).toBe('2026-02');
  });
});

/** Estratto anonimizzato (solo struttura e importi) di una bolletta luce E.ON, come esce da pdfjs. */
const EON_LUCE = `La tua bolletta
Energia   elettrica
PERIODO   DI   FATTURAZIONE

01   settembre   2026   -   30   settembre   2026

Importo   totale   da
pagare
179,00   €

Consumo   totale   fatturato   787,79   kWh
Il   canone   di   abbonamento   alla   televisione   per   uso   privato   di
9,00 €   è   gi à   incluso   nel   totale
Consumo   da   inizio   fornitura   5.396,34   kWh
Periodo   di   riferimento   01   marzo   2026   -   30   settembre   2026
Quota   consumi   113,84   €
Quota   fissa   e   quota   potenza   22,87   €
singoli   prezzi   e   corrisettivi   applicati   ai   quantitativi   consumati   sono   negli
Elementi   di   dettaglio.
Accise   e   IVA   33,34   €
Totale   bolletta   170,00   €
Canone   di   abbonamento   alla   televisione   per   uso   privato   Ottobre   2026   AU000000000000   9,00   €
Totale   da   pagare   179,00   €
Riepilogo   IVA
IVA   10%   154,59   15,46
Totale   Imposte   787,787   17,88
Totale   Quota   variabile   26,11
Totale   oneri   generali   di   sistema   26,11
Elementi   di   Dettaglio   Energia   Elettrica
Corrispettivo   Fisso   Annuo   Vendita   dal   01/09/2026   al   30/09/2026   € \\mese   9,00000000   1,000   9,00   10
Totale   Quota   fissa   €   9,09
Corrispettivo   Consumo   Energia   dal   01/09/2026   al   30/09/2026   € \\kWh   0,08240000   787,787   64,91   10
Totale   Quota   energia   €   76,13
Totale   Spesa   Energia   €   85,22
Totale   Quota   fissa   €   1,92
Totale   Quota   potenza   €   11,86
Totale   Quota   variabile   €   11,60
Totale   Spesa   per   il   Trasporto   e   Gestione   del   Contatore   €   25,38
Totale   Quota   variabile   €   26,11
Totale   Oneri   di   Sistema   €   26,11
Accisa   €   17,88
Totale   Imposte   €   17,88
Arrotondamento   (Attuale   0,07   +   Precedente   -0,12)   €   -0,05   1,000   -0,05   E02
Totale   Altre   Partite   €   -0,05
IVA   10%   su   imponibile   di   €   154,59   €   15,46
F.C.   ART.2   COM.3   L.A   su   imponibile   di   €   -0,05   €   0,00
Totale   Bolletta   €   170,00
`;

describe('bolletta luce E.ON (Elementi di dettaglio)', () => {
  const res = parseElectricityBill(EON_LUCE);
  const cat = (c: string) => res.lines.find((l) => l.category === c)!;

  it('usa il periodo di fatturazione, non quello "da inizio fornitura"', () => {
    expect(res.periodStart).toBe('2026-09-01');
    expect(res.periodEnd).toBe('2026-09-30');
    expect(res.month).toBe('2026-09');
  });
  it('totale, kWh e IVA corretti', () => {
    expect(res.totalAmount).toBe(179);
    expect(res.totalKwh).toBe(787.79);
    expect(res.vatRate).toBe(10);
    expect(res.vatAmount).toBe(15.46); // non "Accise e IVA 33,34"
  });
  it('voci separate in consumo, quota fissa e quota potenza', () => {
    expect(cat('energia')).toMatchObject({ consumo: 76.13, fisso: 9.09, potenza: 0 });
    expect(cat('trasporto')).toMatchObject({ consumo: 11.6, fisso: 1.92, potenza: 11.86 });
    expect(cat('oneri')).toMatchObject({ consumo: 26.11, fisso: 0, potenza: 0 });
    expect(cat('accise')).toMatchObject({ consumo: 17.88 });
    expect(cat('rai')).toMatchObject({ fisso: 9, vatExempt: true });
    expect(cat('altre')).toMatchObject({ consumo: -0.05, vatExempt: true });
  });
  it('le voci + IVA tornano al totale da pagare', () => {
    const sum = res.lines.reduce((s, l) => s + l.consumo + l.fisso + l.potenza, 0) + (res.vatAmount ?? 0);
    expect(Math.round(sum * 100) / 100).toBe(179);
  });
});

describe('bolletta gas E.ON', () => {
  it('periodo di fatturazione, Smc e totale', () => {
    const res = parseGasBill(`La tua bolletta
Gas
PERIODO   DI   FATTURAZIONE

01   settembre   2026   -   30   settembre   2026

Importo   totale   da
pagare
46,00   €

Consumo   totale   fatturato   31,17   Smc
Consumo   da   inizio   fornitura   242,29   Smc
Periodo   di   riferimento   01   marzo   2026   -   30   settembre   2026
Totale   bolletta   46,00   €
Totale   da   pagare   46,00   €`);
    expect(res.month).toBe('2026-09');
    expect(res.periodStart).toBe('2026-09-01');
    expect(res.smc).toBe(31.17);
    expect(res.totalAmount).toBe(46);
  });
});

describe('periodo con mesi in lettere', () => {
  it('riconosce "dal 1 marzo 2026 al 31 marzo 2026"', () => {
    const res = parseGasBill('Periodo di fornitura dal 1 marzo 2026 al 31 marzo 2026\nTotale da pagare 50,00 €');
    expect(res.periodStart).toBe('2026-03-01');
    expect(res.periodEnd).toBe('2026-03-31');
  });
});
