import { describe, expect, it } from 'vitest';
import type { Database, GasBill, Reading } from '@/types';
import { emptyDatabase } from '@/lib/calc/defaults';
import { mergeDatabases } from './merge';

const reading = (id: string, month: string, value: number, isInitial = false): Reading => ({
  id,
  month,
  date: `${month}-28`,
  value,
  isInitial,
});

const gas = (id: string, month: string, totalAmount: number): GasBill => ({
  id,
  month,
  smc: 50,
  totalAmount,
  createdAt: '2026-01-01T00:00:00Z',
});

function baseDb(): Database {
  const db = emptyDatabase();
  db.readings = [reading('i', '2026-01', 1000, true), reading('a', '2026-02', 1100)];
  db.gasBills = [gas('g1', '2026-02', 80)];
  return db;
}

const clone = <T,>(x: T): T => structuredClone(x);

describe('mergeDatabases', () => {
  it('unisce modifiche su elementi diversi senza conflitti', () => {
    const base = baseDb();
    const local = clone(base);
    local.readings.push(reading('b', '2026-03', 1210)); // aggiunta offline
    const remote = clone(base);
    remote.gasBills.push(gas('g2', '2026-03', 90)); // aggiunta da un altro dispositivo
    remote.payments['2026-02'] = { paid: true, date: '2026-03-05' };

    const { db, conflicts } = mergeDatabases(base, local, remote);
    expect(conflicts).toHaveLength(0);
    expect(db.readings.map((r) => r.id)).toEqual(['i', 'a', 'b']);
    expect(db.gasBills.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(db.payments['2026-02']?.paid).toBe(true);
  });

  it('più modifiche offline sopravvivono tutte', () => {
    const base = baseDb();
    const local = clone(base);
    local.readings.push(reading('b', '2026-03', 1210));
    local.readings.push(reading('c', '2026-04', 1300));
    local.gasBills[0].totalAmount = 85;
    local.settings.gasTenantPercent = 40;
    const remote = clone(base);
    remote.readings.find((r) => r.id === 'a')!.note = 'foto aggiunta';

    const { db, conflicts } = mergeDatabases(base, local, remote);
    expect(conflicts).toHaveLength(0);
    expect(db.readings.map((r) => r.id)).toEqual(['i', 'a', 'b', 'c']);
    expect(db.readings.find((r) => r.id === 'a')!.note).toBe('foto aggiunta');
    expect(db.gasBills[0].totalAmount).toBe(85);
    expect(db.settings.gasTenantPercent).toBe(40);
  });

  it('rispetta le eliminazioni fatte da un solo lato', () => {
    const base = baseDb();
    const local = clone(base);
    local.gasBills = []; // eliminata in locale
    const remote = clone(base);
    remote.readings = remote.readings.filter((r) => r.id !== 'a'); // eliminata in remoto

    const { db, conflicts } = mergeDatabases(base, local, remote);
    expect(conflicts).toHaveLength(0);
    expect(db.gasBills).toHaveLength(0);
    expect(db.readings.map((r) => r.id)).toEqual(['i']);
  });

  it('stesso elemento modificato in modo diverso: vince il locale e il conflitto viene segnalato', () => {
    const base = baseDb();
    const local = clone(base);
    local.gasBills[0].totalAmount = 85;
    const remote = clone(base);
    remote.gasBills[0].totalAmount = 99;

    const { db, conflicts } = mergeDatabases(base, local, remote);
    expect(db.gasBills[0].totalAmount).toBe(85);
    expect(conflicts.map((c) => c.item)).toEqual(['Bolletta gas 2026-02']);
  });

  it('stessa modifica su entrambi i lati non è un conflitto', () => {
    const base = baseDb();
    const local = clone(base);
    local.gasBills[0].totalAmount = 85;
    const remote = clone(local);
    expect(mergeDatabases(base, local, remote).conflicts).toHaveLength(0);
  });

  it('lettura dello stesso mese inserita su due dispositivi: ne resta una sola (la locale)', () => {
    const base = baseDb();
    const local = clone(base);
    local.readings.push(reading('local-b', '2026-03', 1210));
    const remote = clone(base);
    remote.readings.push(reading('remote-b', '2026-03', 1205));

    const { db, conflicts } = mergeDatabases(base, local, remote);
    const march = db.readings.filter((r) => r.month === '2026-03');
    expect(march.map((r) => r.id)).toEqual(['local-b']);
    expect(conflicts).toHaveLength(1);
  });

  it('senza base nota non perde i dati remoti né quelli locali', () => {
    const remote = baseDb();
    const local = clone(remote);
    local.readings.push(reading('b', '2026-03', 1210));
    remote.gasBills.push(gas('g2', '2026-03', 90));

    const { db } = mergeDatabases(null, local, remote);
    expect(db.readings.map((r) => r.id)).toContain('b');
    expect(db.gasBills.map((g) => g.id)).toContain('g2');
  });
});
