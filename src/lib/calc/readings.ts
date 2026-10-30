import type { Reading } from '@/types';
import { safeNumber } from './round';

export function sortReadings(readings: Reading[]): Reading[] {
  return [...readings].sort((a, b) => {
    if (a.isInitial !== b.isInitial) return a.isInitial ? -1 : 1;
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.month.localeCompare(b.month);
  });
}

export interface ReadingWithConsumption extends Reading {
  previous: Reading | null;
  /** Consumo = lettura − lettura precedente (null per la lettura iniziale) */
  consumption: number | null;
}

export function withConsumption(readings: Reading[]): ReadingWithConsumption[] {
  const sorted = sortReadings(readings);
  return sorted.map((r, i) => {
    const previous = i > 0 ? sorted[i - 1] : null;
    return {
      ...r,
      previous,
      consumption: r.isInitial || !previous ? null : safeNumber(r.value) - safeNumber(previous.value),
    };
  });
}

/** Consumo dell'inquilino per un mese (prima lettura non iniziale con quel mese). */
export function tenantKwhForMonth(readings: Reading[], month: string): number | null {
  const rows = withConsumption(readings);
  const row = rows.find((r) => !r.isInitial && r.month === month);
  return row?.consumption ?? null;
}

export function readingForMonth(readings: Reading[], month: string): Reading | null {
  return readings.find((r) => !r.isInitial && r.month === month) ?? null;
}

/** Lettura immediatamente precedente a una data (escludendo eventualmente un id). */
export function previousReading(readings: Reading[], date: string, excludeId?: string): Reading | null {
  const sorted = sortReadings(readings.filter((r) => r.id !== excludeId));
  let prev: Reading | null = null;
  for (const r of sorted) {
    if (r.isInitial || r.date <= date) prev = r;
    else break;
  }
  return prev;
}

export function nextReading(readings: Reading[], date: string, excludeId?: string): Reading | null {
  const sorted = sortReadings(readings.filter((r) => r.id !== excludeId && !r.isInitial));
  return sorted.find((r) => r.date > date) ?? null;
}

export interface ReadingValidation {
  errors: string[];
  warnings: string[];
  consumption: number | null;
  average: number | null;
}

/** Media dei consumi degli ultimi `count` mesi precedenti alla data indicata. */
export function recentAverage(readings: Reading[], beforeDate: string, count = 6, excludeId?: string): number | null {
  const rows = withConsumption(readings.filter((r) => r.id !== excludeId)).filter(
    (r) => r.consumption !== null && r.date < beforeDate,
  );
  const last = rows.slice(-count);
  if (!last.length) return null;
  return last.reduce((s, r) => s + (r.consumption ?? 0), 0) / last.length;
}

export function validateReading(
  readings: Reading[],
  candidate: { id?: string; month: string; date: string; value: number; isInitial?: boolean },
  anomalyThresholdPercent = 50,
): ReadingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const value = candidate.value;
  if (!Number.isFinite(value) || value < 0) errors.push('Inserisci un valore valido in kWh.');
  if (!candidate.date) errors.push('Inserisci la data della lettura.');
  if (!candidate.month) errors.push('Seleziona il mese di riferimento.');
  if (candidate.isInitial) return { errors, warnings, consumption: null, average: null };

  const duplicate = readings.find((r) => !r.isInitial && r.month === candidate.month && r.id !== candidate.id);
  if (duplicate) errors.push('Esiste già una lettura per questo mese: modificala dallo storico.');

  const prev = previousReading(readings, candidate.date, candidate.id);
  const next = nextReading(readings, candidate.date, candidate.id);
  let consumption: number | null = null;
  if (!prev) {
    errors.push('Manca la lettura iniziale o una lettura precedente.');
  } else if (Number.isFinite(value)) {
    consumption = value - prev.value;
    if (value < prev.value) {
      errors.push(`La lettura non può essere inferiore alla precedente (${prev.value} kWh).`);
    }
  }
  if (next && Number.isFinite(value) && value > next.value) {
    errors.push(`La lettura non può superare quella successiva (${next.value} kWh del ${next.date}).`);
  }
  const average = recentAverage(readings, candidate.date, 6, candidate.id);
  if (consumption !== null && average !== null && average > 0) {
    const limit = average * (1 + anomalyThresholdPercent / 100);
    if (consumption > limit) {
      const pct = Math.round(((consumption - average) / average) * 100);
      warnings.push(`Consumo anomalo: +${pct}% rispetto alla media degli ultimi mesi (${average.toFixed(1)} kWh).`);
    }
  }
  return { errors, warnings, consumption, average };
}
