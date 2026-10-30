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

describe('periodo con mesi in lettere', () => {
  it('riconosce "dal 1 marzo 2026 al 31 marzo 2026"', () => {
    const res = parseGasBill('Periodo di fornitura dal 1 marzo 2026 al 31 marzo 2026\nTotale da pagare 50,00 €');
    expect(res.periodStart).toBe('2026-03-01');
    expect(res.periodEnd).toBe('2026-03-31');
  });
});
