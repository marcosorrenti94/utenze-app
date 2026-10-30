import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Gauge, LayoutDashboard, PiggyBank, Plus, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpiCard } from '@/components/KpiCard';
import { ChartTooltip } from '@/components/ChartTooltip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { PrivacyNote } from '@/components/PrivacyNote';
import { useData, useDb } from '@/state/DataContext';
import { buildAllSummaries } from '@/lib/calc/summary';
import { billBreakdown } from '@/lib/calc/electricity';
import { CATEGORY_COLORS, COLORS } from '@/lib/palette';
import { formatEuro, formatKwh, formatMonth, formatMonthShort, formatNumber, formatPercent, previousMonth } from '@/lib/format';
import type { Route } from '@/hooks/useHashRoute';
import { cn } from '@/lib/utils';

type SpendView = 'luce' | 'gas' | 'totale';

const axisProps = { tickLine: false, axisLine: false, fontSize: 12 } as const;
const euroTick = (v: number) => `${formatNumber(v, 0)} €`;

function ChartCard({
  title,
  description,
  action,
  children,
  className,
  delay = 0,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }} className={className}>
      <Card className="h-full">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          {action}
        </CardHeader>
        <CardContent className="pt-2">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function DashboardPage({ navigate }: { navigate: (r: Route, p?: string) => void }) {
  const db = useDb();
  const { connection } = useData();
  const summaries = useMemo(() => buildAllSummaries(db), [db]);
  const years = useMemo(() => [...new Set(summaries.map((s) => s.month.slice(0, 4)))].sort().reverse(), [summaries]);
  const [year, setYear] = useState<string>(() => years[0] ?? 'all');
  const [spendView, setSpendView] = useState<SpendView>('totale');
  const selectedYear = years.includes(year) || year === 'all' ? year : (years[0] ?? 'all');

  const rows = useMemo(
    () =>
      summaries
        .filter((s) => selectedYear === 'all' || s.month.startsWith(selectedYear))
        .slice()
        .reverse()
        .map((s) => {
          const e = s.electricity;
          const billKwh = e?.billKwh ?? 0;
          const tenantKwh = s.tenantKwh ?? 0;
          return {
            month: s.month,
            label: formatMonthShort(s.month),
            tenantKwh,
            ownerKwh: billKwh ? Math.max(0, billKwh - tenantKwh) : 0,
            elecTenant: e?.tenantTotal ?? 0,
            elecOwner: e?.ownerTotal ?? 0,
            gasTenant: s.gas?.tenantTotal ?? 0,
            gasOwner: s.gas?.ownerTotal ?? 0,
            totTenant: s.tenantTotal,
            totOwner: s.ownerTotal,
            unitCost: e?.unitCost ?? null,
            avgCost: e && billKwh > 0 ? (e.billTotal || e.computedTotal) / billKwh : null,
          };
        }),
    [summaries, selectedYear],
  );

  if (!summaries.length) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Panoramica di consumi, spese e incassi." />
        <Card>
          <EmptyState
            icon={LayoutDashboard}
            tone="elec"
            title="Benvenuto!"
            description="Inizia inserendo la lettura iniziale del contascatti, poi carica le bollette di luce e gas: qui vedrai grafici e totali."
            action={
              <Button onClick={() => navigate('letture')}>
                <Plus /> Inserisci la prima lettura
              </Button>
            }
          />
        </Card>
        <PrivacyNote className="mt-6" owner={connection.owner} repo={connection.repo} />
      </div>
    );
  }

  // KPI
  const latest = summaries[0];
  const prev = summaries.find((s) => s.month === previousMonth(latest.month)) ?? null;
  const variation = prev && prev.tenantTotal !== 0 ? ((latest.tenantTotal - prev.tenantTotal) / prev.tenantTotal) * 100 : null;
  const kwhVariation = prev?.tenantKwh && latest.tenantKwh !== null ? ((latest.tenantKwh - prev.tenantKwh) / prev.tenantKwh) * 100 : null;
  const yearSummaries = summaries.filter((s) => selectedYear === 'all' || s.month.startsWith(selectedYear));
  const collected = yearSummaries.filter((s) => s.payment.paid).reduce((a, s) => a + s.tenantTotal, 0);
  const outstanding = summaries.filter((s) => !s.payment.paid && s.tenantTotal > 0).reduce((a, s) => a + s.tenantTotal, 0);
  const outstandingCount = summaries.filter((s) => !s.payment.paid && s.tenantTotal > 0).length;

  const lastBill = [...db.electricityBills].sort((a, b) => b.month.localeCompare(a.month))[0];
  const donut = lastBill ? billBreakdown(lastBill) : [];
  const donutTotal = donut.reduce((a, d) => a + d.value, 0);

  const spendKeys = {
    luce: ['elecTenant', 'elecOwner'],
    gas: ['gasTenant', 'gasOwner'],
    totale: ['totTenant', 'totOwner'],
  }[spendView];

  const Trend = ({ v }: { v: number | null }) =>
    v === null ? (
      <span>—</span>
    ) : (
      <span className={cn('inline-flex items-center gap-0.5 font-medium', v > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
        {v > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
        {formatPercent(v)}
      </span>
    );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Panoramica di consumi, spese e incassi."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="year" className="text-sm text-muted-foreground">
              Anno
            </label>
            <Select id="year" value={selectedYear} onChange={(e) => setYear(e.target.value)} className="h-9 w-32">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="all">Tutti</option>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <KpiCard
            index={0}
            icon={Receipt}
            color={COLORS.tenant}
            label="Dovuto questo mese"
            value={formatEuro(latest.tenantTotal)}
            sub={
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => navigate('riepilogo', latest.month)}>
                {formatMonth(latest.month)} · {latest.payment.paid ? 'pagato' : 'da pagare'}
              </button>
            }
          />
        </div>
        <KpiCard
          index={1}
          icon={Gauge}
          color={COLORS.electricity}
          label="kWh inquilino"
          value={formatKwh(latest.tenantKwh)}
          sub={
            <span className="inline-flex items-center gap-1">
              <Trend v={kwhVariation} /> vs mese prec.
            </span>
          }
        />
        <KpiCard
          index={2}
          icon={variation !== null && variation > 0 ? ArrowUpRight : ArrowDownRight}
          color={variation !== null && variation > 0 ? '#ef4444' : COLORS.owner}
          label="Variazione dovuto"
          value={variation === null ? '—' : formatPercent(variation)}
          sub={prev ? `vs ${formatMonth(prev.month, false)} (${formatEuro(prev.tenantTotal)})` : 'nessun mese precedente'}
        />
        <KpiCard
          index={3}
          icon={PiggyBank}
          color={COLORS.owner}
          label={selectedYear === 'all' ? 'Totale incassato' : `Incassato ${selectedYear}`}
          value={formatEuro(collected)}
          sub={`${yearSummaries.filter((s) => s.payment.paid).length} mesi pagati`}
        />
        <KpiCard
          index={4}
          icon={Wallet}
          color={COLORS.gasAlt}
          label="Da incassare"
          value={formatEuro(outstanding)}
          sub={outstandingCount ? `${outstandingCount} mesi in sospeso` : 'Tutto incassato'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Consumi mensili"
          description="kWh fatturati: quota inquilino e quota mia"
          delay={0.1}
          action={
            <div className="hidden gap-3 sm:flex">
              <LegendDot color={COLORS.tenant} label="Inquilino" />
              <LegendDot color={COLORS.owner} label="Io" />
            </div>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v: number) => formatNumber(v, 0)} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                  content={<ChartTooltip kind="kwh" showTotal labelFormatter={(l) => l} />}
                />
                <Bar dataKey="tenantKwh" name="Inquilino" stackId="kwh" fill={COLORS.tenant} radius={[0, 0, 4, 4]} animationDuration={700} />
                <Bar dataKey="ownerKwh" name="Io" stackId="kwh" fill={COLORS.owner} radius={[6, 6, 0, 0]} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Andamento spesa"
          description="Quota inquilino vs quota mia"
          delay={0.15}
          action={
            <Tabs value={spendView} onValueChange={(v) => setSpendView(v as SpendView)}>
              <TabsList>
                <TabsTrigger value="luce">Luce</TabsTrigger>
                <TabsTrigger value="gas">Gas</TabsTrigger>
                <TabsTrigger value="totale">Totale</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-tenant" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.tenant} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={COLORS.tenant} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="g-owner" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.owner} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.owner} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={euroTick} />
                <Tooltip content={<ChartTooltip kind="euro" showTotal />} />
                <Area
                  key={`${spendView}-t`}
                  type="monotone"
                  dataKey={spendKeys[0]}
                  name="Inquilino"
                  stackId="s"
                  stroke={COLORS.tenant}
                  strokeWidth={2}
                  fill="url(#g-tenant)"
                  animationDuration={700}
                />
                <Area
                  key={`${spendView}-o`}
                  type="monotone"
                  dataKey={spendKeys[1]}
                  name="Io"
                  stackId="s"
                  stroke={COLORS.owner}
                  strokeWidth={2}
                  fill="url(#g-owner)"
                  animationDuration={700}
                />
                <Legend verticalAlign="top" height={24} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Costo medio dell’energia" description="€/kWh: quota a consumo e costo complessivo" delay={0.2}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v: number) => v.toFixed(2).replace('.', ',')} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip kind="unit" />} />
                <Legend verticalAlign="top" height={24} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="unitCost"
                  name="Quota a consumo"
                  stroke={COLORS.electricity}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 0, fill: COLORS.electricity }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  animationDuration={800}
                />
                <Line
                  type="monotone"
                  dataKey="avgCost"
                  name="Costo complessivo"
                  stroke={COLORS.electricityDark}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Composizione ultima bolletta luce"
          description={lastBill ? `${formatMonth(lastBill.month)} · ${formatEuro(lastBill.totalAmount)}` : 'Nessuna bolletta'}
          delay={0.25}
        >
          {donut.length ? (
            <div className="grid items-center gap-4 sm:grid-cols-[1fr_1fr]">
              <div className="relative h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<ChartTooltip kind="euro" />} />
                    <Pie
                      data={donut}
                      dataKey="value"
                      nameKey="label"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={2}
                      cornerRadius={4}
                      stroke="none"
                      animationDuration={800}
                    >
                      {donut.map((d) => (
                        <Cell key={d.key} fill={CATEGORY_COLORS[d.key]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-muted-foreground">Totale voci</span>
                  <span className="text-lg font-semibold tabular">{formatEuro(donutTotal)}</span>
                </div>
              </div>
              <ul className="space-y-2">
                {donut.map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="size-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[d.key] }} />
                      {d.label}
                    </span>
                    <span className="tabular">
                      {formatEuro(d.value)}
                      <span className="ml-1.5 text-xs text-muted-foreground">{formatNumber((d.value / donutTotal) * 100, 0)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState icon={Receipt} tone="elec" title="Nessun dettaglio" description="Carica una bolletta luce per vedere la composizione delle voci." className="py-6" />
          )}
        </ChartCard>
      </div>

      <PrivacyNote className="mt-6" owner={connection.owner} repo={connection.repo} />
    </div>
  );
}
