import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartTooltip } from './ChartTooltip';
import { EmptyState } from './EmptyState';
import { splitByYear, splitTotals, type SplitPoint } from '@/lib/calc/split';
import { COLORS } from '@/lib/palette';
import { formatEuro, formatMonthShort, formatNumber } from '@/lib/format';

type Period = 'mese' | 'anno';
type Metric = 'consumo' | 'spesa';

const axisProps = { tickLine: false, axisLine: false, fontSize: 12 } as const;

/**
 * Consumo (kWh o Smc) e spesa di ciascuna persona, mese per mese o anno per anno,
 * con barre affiancate e totali del periodo mostrato.
 */
export function PersonSplitCard({
  title,
  description,
  icon: Icon,
  accent,
  unit,
  points,
  year,
  names,
  note,
  delay = 0,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  unit: 'kWh' | 'Smc';
  /** Punti mensili (tutti gli anni) */
  points: SplitPoint[];
  /** Anno selezionato nella dashboard ('all' = tutti): filtra la vista mensile */
  year: string;
  names: { tenant: string; owner: string };
  note?: string;
  delay?: number;
}) {
  const [period, setPeriod] = useState<Period>('mese');
  const [metric, setMetric] = useState<Metric>('consumo');

  const shown = useMemo(
    () => (period === 'anno' ? splitByYear(points) : points.filter((p) => year === 'all' || p.period.startsWith(year))),
    [period, points, year],
  );
  const data = shown.map((p) => ({
    label: period === 'anno' ? p.period : formatMonthShort(p.period),
    tenant: metric === 'consumo' ? p.tenantQty : p.tenantEur,
    owner: metric === 'consumo' ? p.ownerQty : p.ownerEur,
  }));
  const totals = splitTotals(shown);
  const qty = (v: number) => `${formatNumber(v, 0)} ${unit}`;
  const scope = period === 'anno' ? 'tutti gli anni' : year === 'all' ? 'tutti i mesi' : `mesi del ${year}`;

  const person = (name: string, color: string, q: number, eur: number, shareQ: number, shareE: number) => (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {name}
      </p>
      <p className="mt-1 text-lg font-semibold tabular">{formatEuro(eur)}</p>
      <p className="text-xs text-muted-foreground tabular">
        {qty(q)} · {formatNumber(shareQ, 0)}% dei consumi · {formatNumber(shareE, 0)}% della spesa
      </p>
    </div>
  );
  const sumQ = totals.tenantQty + totals.ownerQty;
  const sumE = totals.tenantEur + totals.ownerEur;
  const pct = (part: number, all: number) => (all > 0 ? (part / all) * 100 : 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}>
      <Card className="h-full">
        <CardHeader className="space-y-3 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon className="size-4" style={{ color: accent }} />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <TabsList aria-label="Periodo">
                <TabsTrigger value="mese">Mensile</TabsTrigger>
                <TabsTrigger value="anno">Annuale</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList aria-label="Dato mostrato">
                <TabsTrigger value="consumo">Consumo ({unit})</TabsTrigger>
                <TabsTrigger value="spesa">Spesa (€)</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {data.length === 0 ? (
            <EmptyState
              icon={Icon}
              tone={unit === 'kWh' ? 'elec' : 'gas'}
              title="Nessun dato nel periodo"
              description="Carica le bollette (e per la luce le letture del contascatti) per vedere il confronto."
              className="py-6"
            />
          ) : (
            <>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="24%" barGap={3}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={(v: number) => (metric === 'spesa' ? `${formatNumber(v, 0)} €` : formatNumber(v, 0))} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                      content={<ChartTooltip kind={metric === 'spesa' ? 'euro' : unit === 'kWh' ? 'kwh' : 'smc'} showTotal />}
                    />
                    <Bar dataKey="tenant" name={names.tenant} fill={COLORS.tenant} radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={600} />
                    <Bar dataKey="owner" name={names.owner} fill={COLORS.owner} radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={600} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Totale {scope}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {person(names.tenant, COLORS.tenant, totals.tenantQty, totals.tenantEur, pct(totals.tenantQty, sumQ), pct(totals.tenantEur, sumE))}
                  {person(names.owner, COLORS.owner, totals.ownerQty, totals.ownerEur, pct(totals.ownerQty, sumQ), pct(totals.ownerEur, sumE))}
                </div>
              </div>
            </>
          )}
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
