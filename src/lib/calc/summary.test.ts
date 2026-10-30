import { describe, expect, it } from 'vitest';
import type { Database } from '@/types';
import { emptyDatabase } from './defaults';
import { buildMonthSummary, buildSnapshots, freezePaidMonths, setMonthPaid } from './summary';

function db(): Database {
  const d = emptyDatabase();
  d.gasBills = [
    { id: 'g1', month: '2026-02', smc: 50, totalAmount: 100, createdAt: '2026-03-01T00:00:00Z' },
    { id: 'g2', month: '2026-03', smc: 50, totalAmount: 100, createdAt: '2026-04-01T00:00:00Z' },
  ];
  return d;
}

describe('mesi pagati e modifica delle impostazioni', () => {
  it('un mese segnato come pagato non cambia se cambiano le impostazioni', () => {
    const d = setMonthPaid(db(), '2026-02', true, '2026-03-10');
    d.settings.gasTenantPercent = 50;

    expect(buildMonthSummary(d, '2026-02').tenantTotal).toBe(35); // regole congelate (35%)
    expect(buildMonthSummary(d, '2026-03').tenantTotal).toBe(50); // mese da pagare: regole nuove
    expect(buildSnapshots(d)['2026-02'].gasTenant).toBe(35);
  });

  it('riportare il mese a "da pagare" lo ricalcola con le regole correnti', () => {
    const d = setMonthPaid(db(), '2026-02', true, '2026-03-10');
    d.settings.gasTenantPercent = 50;
    setMonthPaid(d, '2026-02', false, '2026-03-10');
    expect(buildMonthSummary(d, '2026-02').tenantTotal).toBe(50);
  });

  it('cambiare la data di pagamento non aggiorna le regole congelate', () => {
    const d = setMonthPaid(db(), '2026-02', true, '2026-03-10');
    d.settings.gasTenantPercent = 50;
    setMonthPaid(d, '2026-02', true, '2026-03-12');
    expect(d.payments['2026-02'].date).toBe('2026-03-12');
    expect(buildMonthSummary(d, '2026-02').tenantTotal).toBe(35);
  });

  it('dati di versioni precedenti: freezePaidMonths congela le regole prima della modifica', () => {
    const d = db();
    d.payments['2026-02'] = { paid: true, date: '2026-03-10' }; // pagamento senza regole salvate
    freezePaidMonths(d);
    d.settings = { ...d.settings, gasTenantPercent: 50 };
    expect(buildMonthSummary(d, '2026-02').tenantTotal).toBe(35);
    expect(d.payments['2026-03']).toBeUndefined();
  });

  it('le regole congelate sono una copia indipendente dalle impostazioni', () => {
    const d = setMonthPaid(db(), '2026-02', true, '2026-03-10');
    d.settings.allocation.energia.consumo.method = 'half';
    expect(d.payments['2026-02'].calcSettings?.allocation.energia.consumo.method).toBe('kwh');
  });
});
