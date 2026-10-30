import type { TooltipProps } from 'recharts';
import { formatEuro, formatKwh, formatEuroPrecise, formatNumber } from '@/lib/format';

type Kind = 'euro' | 'kwh' | 'smc' | 'unit';

const fmt = (v: number, kind: Kind) =>
  kind === 'euro'
    ? formatEuro(v)
    : kind === 'kwh'
      ? formatKwh(v)
      : kind === 'smc'
        ? `${formatNumber(v)} Smc`
        : `${formatEuroPrecise(v)}/kWh`;

/** Tooltip personalizzato coerente con il design system. */
export function ChartTooltip({
  active,
  payload,
  label,
  kind = 'euro',
  showTotal = false,
  labelFormatter,
}: TooltipProps<number, string> & { kind?: Kind; showTotal?: boolean; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== undefined && p.value !== null);
  const total = items.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div className="min-w-[180px] rounded-xl border bg-popover/95 px-3 py-2.5 text-popover-foreground shadow-lift backdrop-blur">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-semibold">{labelFormatter ? labelFormatter(String(label)) : String(label)}</p>
      )}
      <ul className="space-y-1">
        {items.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: (p.payload?.fill as string) || p.color }} />
              {p.name}
            </span>
            <span className="font-medium tabular">{fmt(Number(p.value), kind)}</span>
          </li>
        ))}
      </ul>
      {showTotal && items.length > 1 && (
        <div className="mt-1.5 flex justify-between border-t pt-1.5 text-xs font-semibold">
          <span>Totale</span>
          <span className="tabular">{fmt(total, kind)}</span>
        </div>
      )}
    </div>
  );
}
