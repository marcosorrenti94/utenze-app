import { describe, expect, it } from 'vitest';
import type { BillLine, ElectricityBill } from '@/types';
import { computeElectricity } from './electricity';
import { defaultAllocation } from './defaults';
import { computeGas } from './gas';
import { validateReading, withConsumption } from './readings';
import { round2 } from './round';

let seq = 0;
const line = (p: Partial<BillLine> & Pick<BillLine, 'category'>): BillLine => ({
  id: `l${++seq}`,
  label: '',
  consumo: 0,
  fisso: 0,
  potenza: 0,
  vatExempt: false,
  ...p,
});

/**
 * Bolletta mensile realistica (residente, 3 kW, IVA 10%), 300 kWh fatturati.
 *  - Materia energia: 60,00 € a consumo + 12,00 € quota fissa
 *  - Trasporto e contatore: 9,00 € consumo + 6,00 € fissa + 7,20 € potenza
 *  - Oneri di sistema: 15,00 € consumo + 4,00 € fissa
 *  - Accise: 6,81 €
 *  - Canone RAI: 9,00 € (esente IVA)
 *  Imponibile 120,01 € → IVA 12,00 € → Totale 141,01 €
 */
function baseBill(extra: BillLine[] = [], overrides: Partial<ElectricityBill> = {}): ElectricityBill {
  return {
    id: 'b1',
    month: '2026-03',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    totalKwh: 300,
    totalAmount: 141.01,
    vatRate: 10,
    vatAmount: 12.0,
    lines: [
      line({ category: 'energia', label: 'Materia energia', consumo: 60, fisso: 12 }),
      line({ category: 'trasporto', label: 'Trasporto e contatore', consumo: 9, fisso: 6, potenza: 7.2 }),
      line({ category: 'oneri', label: 'Oneri di sistema', consumo: 15, fisso: 4 }),
      line({ category: 'accise', label: 'Accise', consumo: 6.81 }),
      line({ category: 'rai', label: 'Canone RAI', fisso: 9, vatExempt: true }),
      ...extra,
    ],
    createdAt: '2026-04-05T10:00:00Z',
    ...overrides,
  };
}

describe('computeElectricity', () => {
  it('caso standard: 120 kWh su 300, IVA 10% applicata all’imponibile dell’inquilino', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation: defaultAllocation(), vatMode: 'rate' });

    // Pool a consumo = 60 + 15 + 6,81 = 81,81 € → 0,2727 €/kWh
    expect(res.kwhPoolAmount).toBeCloseTo(81.81, 10);
    expect(res.unitCost).toBeCloseTo(0.2727, 10);
    expect(res.tenantKwhCost).toBeCloseTo(32.724, 10); // 120 × 0,2727

    // Voci al 50%: 12 + 9 + 6 + 7,2 + 4 = 38,2 → 19,10 all'inquilino
    expect(res.tenantTaxable).toBeCloseTo(32.724 + 19.1, 10);
    expect(res.vat.tenant).toBeCloseTo(5.1824, 10);
    expect(res.tenantExempt).toBeCloseTo(4.5, 10); // metà canone RAI

    // 51,824 + 5,1824 + 4,5 = 61,5064 → 61,51 €
    expect(res.tenantRaw).toBeCloseTo(61.5064, 10);
    expect(res.tenantTotal).toBe(61.51);
    expect(res.ownerTotal).toBe(79.5);
    expect(round2(res.tenantTotal + res.ownerTotal)).toBe(141.01);
    expect(res.warnings.filter((w) => w.level !== 'info')).toHaveLength(0);
  });

  it('trasporto sempre al 50%, anche la quota a consumo', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation: defaultAllocation(), vatMode: 'rate' });
    const transport = res.rows.filter((r) => r.category === 'trasporto');
    expect(transport).toHaveLength(3);
    transport.forEach((r) => {
      expect(r.method).toBe('half');
      expect(r.tenant).toBeCloseTo(r.amount / 2, 10);
    });
  });

  it('conguaglio a credito (-20 €) diviso al 50% di default', () => {
    const bill = baseBill([line({ category: 'altre', label: 'Conguaglio letture', consumo: -20 })], {
      totalAmount: 119.01,
      vatAmount: 10.0,
    });
    const res = computeElectricity({ bill, tenantKwh: 120, allocation: defaultAllocation(), vatMode: 'rate' });
    // Imponibile inquilino = 51,824 − 10 = 41,824 → IVA 4,1824 → + RAI 4,5 = 50,5064
    expect(res.tenantRaw).toBeCloseTo(50.5064, 10);
    expect(res.tenantTotal).toBe(50.51);
    expect(res.ownerTotal).toBe(68.5);
  });

  it('conguaglio configurato come proporzionale ai kWh entra nel costo unitario', () => {
    const allocation = defaultAllocation();
    allocation.altre.consumo = { method: 'kwh', tenantPercent: 50 };
    const bill = baseBill([line({ category: 'altre', label: 'Conguaglio', consumo: -20 })], {
      totalAmount: 119.01,
      vatAmount: 10.0,
    });
    const res = computeElectricity({ bill, tenantKwh: 120, allocation, vatMode: 'rate' });
    // Pool = 81,81 − 20 = 61,81 → 0,206033 €/kWh → 24,724 € all'inquilino
    expect(res.unitCost).toBeCloseTo(61.81 / 300, 10);
    expect(res.tenantKwhCost).toBeCloseTo(24.724, 10);
    expect(res.tenantTotal).toBe(52.71); // (24,724 + 19,1) × 1,10 + 4,5 = 52,7064
  });

  it('inquilino a consumo zero: paga solo le quote fisse al 50%', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 0, allocation: defaultAllocation(), vatMode: 'rate' });
    expect(res.tenantKwhCost).toBe(0);
    // 19,10 + IVA 1,91 + RAI 4,50 = 25,51
    expect(res.tenantTotal).toBe(25.51);
    expect(res.ownerTotal).toBe(115.5);
    res.rows.filter((r) => r.method === 'kwh').forEach((r) => expect(r.tenant).toBe(0));
  });

  it('IVA proporzionale all’imponibile dà lo stesso risultato quando l’IVA è coerente', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation: defaultAllocation(), vatMode: 'proportional' });
    expect(res.vat.tenant).toBeCloseTo(12 * (51.824 / 120.01), 10);
    expect(res.tenantTotal).toBe(61.51);
  });

  it('regole personalizzate ed escluse', () => {
    const allocation = defaultAllocation();
    allocation.trasporto.consumo = { method: 'custom', tenantPercent: 30 };
    allocation.rai.fisso = { method: 'excluded', tenantPercent: 0 };
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation, vatMode: 'rate' });
    // Rispetto al caso standard: trasporto consumo 2,70 invece di 4,50 (−1,80 imponibile), RAI 0 invece di 4,50
    const expected = (32.724 + 19.1 - 1.8) * 1.1;
    expect(res.tenantRaw).toBeCloseTo(expected, 10);
    expect(res.tenantTotal).toBe(round2(expected));
    expect(res.tenantExempt).toBe(0);
  });

  it('segnala kWh inquilino superiori ai kWh in bolletta e totale incoerente', () => {
    const res = computeElectricity({
      bill: baseBill([], { totalAmount: 150 }),
      tenantKwh: 350,
      allocation: defaultAllocation(),
      vatMode: 'rate',
    });
    const codes = res.warnings.map((w) => w.code);
    expect(codes).toContain('tenant-exceeds-bill');
    expect(codes).toContain('total-mismatch');
  });

  it('kWh inquilino oltre la bolletta: quota a consumo limitata al 100%, mai quota proprietario negativa', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 350, allocation: defaultAllocation(), vatMode: 'rate' });
    res.rows
      .filter((r) => r.method === 'kwh')
      .forEach((r) => {
        expect(r.tenantRatio).toBe(1);
        expect(r.owner).toBeCloseTo(0, 10);
      });
    expect(res.tenantKwhCost).toBeCloseTo(81.81, 10);
    // (81,81 + 19,10) × 1,10 + 4,50 = 115,501
    expect(res.tenantTotal).toBe(115.5);
    expect(res.ownerTotal).toBe(25.51);
    expect(res.warnings.map((w) => w.code)).toContain('tenant-exceeds-bill');
  });

  it('kWh della bolletta mancanti: errore e nessuna quota a consumo', () => {
    const res = computeElectricity({
      bill: baseBill([], { totalKwh: 0 }),
      tenantKwh: 100,
      allocation: defaultAllocation(),
      vatMode: 'rate',
    });
    expect(res.unitCost).toBeNull();
    expect(res.warnings.map((w) => w.code)).toContain('missing-bill-kwh');
  });
});

describe('computeGas', () => {
  it('35% del totale arrotondato al centesimo', () => {
    const res = computeGas({ totalAmount: 87.4 }, 35);
    expect(res.tenantTotal).toBe(30.59); // 30,59
    expect(res.ownerTotal).toBe(56.81);
  });
  it('percentuale personalizzata', () => {
    expect(computeGas({ totalAmount: 100 }, 40).tenantTotal).toBe(40);
  });
});

describe('letture contascatti', () => {
  const readings = [
    { id: 'i', month: '2026-01', date: '2026-01-31', value: 1000, isInitial: true },
    { id: 'a', month: '2026-02', date: '2026-02-28', value: 1100, isInitial: false },
    { id: 'b', month: '2026-03', date: '2026-03-31', value: 1210, isInitial: false },
  ];

  it('calcola il consumo come differenza con la lettura precedente', () => {
    const rows = withConsumption(readings);
    expect(rows.map((r) => r.consumption)).toEqual([null, 100, 110]);
  });

  it('rifiuta letture inferiori alla precedente', () => {
    const v = validateReading(readings, { month: '2026-04', date: '2026-04-30', value: 1200 });
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('segnala consumi anomali (> +50% della media)', () => {
    const v = validateReading(readings, { month: '2026-04', date: '2026-04-30', value: 1400 });
    expect(v.consumption).toBe(190);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings.length).toBe(1);
  });
});
