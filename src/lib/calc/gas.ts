import type { GasBill } from '@/types';
import { round2, safeNumber } from './round';

export interface GasResult {
  total: number;
  percent: number;
  tenantRaw: number;
  tenantTotal: number;
  ownerTotal: number;
}

/** L'inquilino paga una percentuale fissa (default 35%) dell'importo totale della bolletta gas. */
export function computeGas(bill: Pick<GasBill, 'totalAmount'>, tenantPercent: number): GasResult {
  const total = safeNumber(bill.totalAmount);
  const percent = Math.min(Math.max(safeNumber(tenantPercent), 0), 100);
  const tenantRaw = (total * percent) / 100;
  const tenantTotal = round2(tenantRaw);
  return { total, percent, tenantRaw, tenantTotal, ownerTotal: round2(round2(total) - tenantTotal) };
}
