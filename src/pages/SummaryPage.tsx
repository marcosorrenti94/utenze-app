import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, Clock, Copy, FileDown, Flame, Receipt, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { WarningList } from '@/components/WarningList';
import { useData, useDb } from '@/state/DataContext';
import { buildAllSummaries, setMonthPaid, type MonthSummary } from '@/lib/calc/summary';
import { buildShareMessage } from '@/lib/message';
import { exportMonthPdf } from '@/lib/pdfExport';
import { formatDate, formatEuro, formatEuroPrecise, formatKwh, formatMonth, formatNumber, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'due' | 'paid';

export function SummaryPage({ focusMonth }: { focusMonth: string | null }) {
  const db = useDb();
  const summaries = useMemo(() => buildAllSummaries(db), [db]);
  const [filter, setFilter] = useState<Filter>('all');
  const list = summaries.filter((s) => (filter === 'all' ? true : filter === 'paid' ? s.payment.paid : !s.payment.paid));

  return (
    <div>
      <PageHeader
        title="Riepilogo mensile"
        description="Quanto deve pagarti l’inquilino ogni mese, con il dettaglio trasparente del calcolo."
        actions={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">Tutti</TabsTrigger>
              <TabsTrigger value="due">Da pagare</TabsTrigger>
              <TabsTrigger value="paid">Pagati</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            tone="tenant"
            title={summaries.length ? 'Nessun mese in questo filtro' : 'Ancora nessun riepilogo'}
            description="Inserisci una lettura del contascatti e le bollette del mese per vedere quanto deve pagare l’inquilino."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map((s, i) => (
            <MonthCard key={s.month} summary={s} index={i} defaultOpen={focusMonth === s.month} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonthCard({ summary: s, index, defaultOpen }: { summary: MonthSummary; index: number; defaultOpen: boolean }) {
  const db = useDb();
  const { update, readOnly } = useData();
  const [open, setOpen] = useState(defaultOpen);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (defaultOpen) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [defaultOpen]);

  const issues = s.warnings.filter((w) => w.level !== 'info').length;

  async function setPaid(paid: boolean, date?: string) {
    await update(
      (d) => setMonthPaid(d, s.month, paid, date ?? d.payments[s.month]?.date ?? todayIso()),
      paid ? `${formatMonth(s.month)} segnato come pagato` : `${formatMonth(s.month)} segnato da pagare`,
    );
  }

  async function copyMessage() {
    const text = buildShareMessage(s, db.settings);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Messaggio copiato', { description: 'Incollalo su WhatsApp o in una email.' });
    } catch {
      toast.error('Copia non riuscita', { description: 'Il browser non consente l’accesso agli appunti.' });
    }
  }

  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
      <Card className={cn('overflow-hidden scroll-mt-20', open && 'shadow-lift')}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-2xl',
                s.payment.paid ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
              )}
            >
              {s.payment.paid ? <CheckCircle2 className="size-5" /> : <Clock className="size-5" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{formatMonth(s.month)}</h2>
                {s.payment.paid ? (
                  <Badge variant="success">Pagato{s.payment.date ? ` il ${formatDate(s.payment.date)}` : ''}</Badge>
                ) : (
                  <Badge variant="tenant">Da pagare</Badge>
                )}
                {issues > 0 && <Badge variant="warning">{issues} avvisi</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Zap className="size-3 text-amber-500" /> Luce {s.electricity ? formatEuro(s.electricity.tenantTotal) : '—'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Flame className="size-3 text-cyan-500" /> Gas {s.gas ? formatEuro(s.gas.tenantTotal) : '—'}
                </span>
                <span>{formatKwh(s.tenantKwh)} inquilino</span>
              </div>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end sm:gap-1">
            <p className="text-xs text-muted-foreground">Totale dovuto dall’inquilino</p>
            <p className="text-2xl font-semibold tracking-tight tabular sm:text-3xl">{formatEuro(s.tenantTotal)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {readOnly ? (
            <p className="text-sm text-muted-foreground">
              {s.payment.paid ? `Pagato${s.payment.date ? ` il ${formatDate(s.payment.date)}` : ''}` : 'Non ancora pagato'}
            </p>
          ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={s.payment.paid} onCheckedChange={(v) => void setPaid(v)} aria-label="Pagato" />
              Pagato
            </label>
            {s.payment.paid && (
              <div className="flex items-center gap-2">
                <label htmlFor={`pay-${s.month}`} className="text-xs text-muted-foreground">
                  il
                </label>
                <Input
                  id={`pay-${s.month}`}
                  type="date"
                  className="h-8 w-auto"
                  value={s.payment.date ?? ''}
                  onChange={(e) => void setPaid(true, e.target.value)}
                />
              </div>
            )}
          </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={() => void copyMessage()}>
              <Copy /> Copia messaggio
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await exportMonthPdf(s, db.settings);
                } catch (e) {
                  toast.error('Esportazione PDF non riuscita', { description: e instanceof Error ? e.message : undefined });
                } finally {
                  setExporting(false);
                }
              }}
            >
              <FileDown /> PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              Dettaglio
              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-6 border-t p-5 sm:p-6">
                <WarningList warnings={s.warnings} />
                <CalcDetail summary={s} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function CalcDetail({ summary: s }: { summary: MonthSummary }) {
  const e = s.electricity;
  const g = s.gas;
  return (
    <div className="space-y-6">
      {e && s.electricityBill && (
        <section aria-label="Dettaglio luce">
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <h3 className="flex items-center gap-2 font-semibold">
              <Zap className="size-4 text-amber-500" /> Luce
            </h3>
            <span className="text-muted-foreground">
              Bolletta <strong className="text-foreground tabular">{formatEuro(e.billTotal)}</strong> · {formatKwh(e.billKwh)}
            </span>
            <span className="text-muted-foreground">
              Inquilino <strong className="text-foreground tabular">{formatKwh(e.tenantKwh)}</strong> · Io {formatKwh(e.ownerKwh)}
            </span>
            {e.unitCost !== null && (
              <span className="text-muted-foreground">
                Costo unitario <strong className="text-foreground tabular">{formatEuroPrecise(e.unitCost)}/kWh</strong>
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Ripartizione voce per voce della bolletta luce</caption>
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Voce</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Importo</th>
                  <th scope="col" className="px-3 py-2 font-medium">Criterio</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-violet-600 dark:text-violet-300">Inquilino</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">Io</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {e.rows.map((r) => (
                  <tr key={`${r.lineId}-${r.component}`}>
                    <td className="px-3 py-2">
                      {r.label}
                      {!r.taxable && <span className="ml-1 text-[11px] text-muted-foreground">(esente IVA)</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{formatEuro(r.amount)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.criterion}</td>
                    <td className="px-3 py-2 text-right tabular">{formatEuro(r.tenant)}</td>
                    <td className="px-3 py-2 text-right tabular">{formatEuro(r.owner)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2">IVA {formatNumber(e.vat.rate)}%</td>
                  <td className="px-3 py-2 text-right tabular">{formatEuro(e.vat.amount)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {e.vat.mode === 'rate' ? 'Aliquota applicata all’imponibile di ciascuno' : 'Proporzionale all’imponibile'}
                  </td>
                  <td className="px-3 py-2 text-right tabular">{formatEuro(e.vat.tenant)}</td>
                  <td className="px-3 py-2 text-right tabular">{formatEuro(e.vat.owner)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-muted/40 font-semibold">
                <tr>
                  <td className="px-3 py-2.5">Totale luce</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatEuro(e.billTotal || e.computedTotal)}</td>
                  <td className="px-3 py-2.5 text-xs font-normal text-muted-foreground">Arrotondato al centesimo solo il totale</td>
                  <td className="px-3 py-2.5 text-right tabular text-violet-600 dark:text-violet-300">{formatEuro(e.tenantTotal)}</td>
                  <td className="px-3 py-2.5 text-right tabular text-emerald-600 dark:text-emerald-400">{formatEuro(e.ownerTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {e.unitCost !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Voci a consumo: {formatEuro(e.kwhPoolAmount)} ÷ {formatKwh(e.billKwh)} = {formatEuroPrecise(e.unitCost)}/kWh × {formatKwh(e.tenantKwh)} ={' '}
              <strong className="text-foreground">{formatEuro(e.tenantKwhCost)}</strong> (IVA esclusa)
            </p>
          )}
        </section>
      )}

      {g && s.gasBill && (
        <section aria-label="Dettaglio gas">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Flame className="size-4 text-cyan-500" /> Gas
          </h3>
          <div className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Totale bolletta</p>
              <p className="font-medium tabular">{formatEuro(g.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Consumo</p>
              <p className="font-medium tabular">{s.gasBill.smc ? `${formatNumber(s.gasBill.smc)} Smc` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inquilino ({formatNumber(g.percent)}%)</p>
              <p className="font-semibold tabular text-violet-600 dark:text-violet-300">{formatEuro(g.tenantTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Io</p>
              <p className="font-semibold tabular text-emerald-600 dark:text-emerald-400">{formatEuro(g.ownerTotal)}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
