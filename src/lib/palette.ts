import type { ElecCategory } from '@/types';

/** Palette unica usata da tutti i grafici e badge. */
export const COLORS = {
  electricity: '#f59e0b',
  electricityDark: '#d97706',
  gas: '#06b6d4',
  gasAlt: '#3b82f6',
  tenant: '#8b5cf6',
  owner: '#10b981',
} as const;

export const CATEGORY_COLORS: Record<ElecCategory | 'iva', string> = {
  energia: '#f59e0b',
  trasporto: '#f97316',
  oneri: '#eab308',
  accise: '#b45309',
  rai: '#94a3b8',
  altre: '#64748b',
  iva: '#fcd34d',
};
