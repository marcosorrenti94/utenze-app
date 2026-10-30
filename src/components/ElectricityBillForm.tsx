import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import type { BillLine, ElecCategory, ElectricityBill } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Field } from './Field';
import { NumberInput } from './NumberInput';
import { AutoBadge } from './AutoBadge';
import { WarningList } from './WarningList';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/calc/defaults';
import { computeElectricity } from '@/lib/calc/electricity';
import { calcSettingsForMonth, checkPeriod } from '@/lib/calc/summary';
import { readingForMonth, tenantKwhForMonth } from '@/lib/calc/readings';
import { formatEuro, formatEuroPrecise, formatKwh, formatMonth } from '@/lib/format';
import { useDb } from '@/state/DataContext';
import { uid } from '@/lib/utils';

interface Props {
  initial: ElectricityBill;
  fileName?: string | null;
  onCancel: () => void;
  onSave: (bill: ElectricityBill) => Promise<void>;
}

export function ElectricityBillForm({ initial, fileName, onCancel, onSave }: Props) {
  const db = useDb();
  const [bill, setBill] = useState<ElectricityBill>(initial);
  const [saving, setSaving] = useState(false);
  const auto = new Set(initial.autoExtracted ?? []);
  const isAuto = (k: string) => auto.has(k);

  const set = <K extends keyof ElectricityBill>(k: K, v: ElectricityBill[K]) => setBill((b) => ({ ...b, [k]: v }));
  const setLine = (id: string, patch: Partial<BillLine>) =>
    setBill((b) => ({ ...b, lines: b.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const tenantKwh = tenantKwhForMonth(db.readings, bill.month);
  const preview = useMemo(() => {
    const settings = calcSettingsForMonth(db, bill.month);
    return computeElectricity({
      bill,
      tenantKwh: tenantKwh ?? 0,
      allocation: settings.allocation,
      vatMode: settings.vatMode,
    });
  }, [bill, tenantKwh, db]);
  const warnings = [...preview.warnings];
  if (tenantKwh === null) {
    warnings.unshift({ level: 'warning', code: 'missing-reading', message: `Nessuna lettura del contascatti per ${formatMonth(bill.month, false)}.` });
  }
  const period = checkPeriod(readingForMonth(db.readings, bill.month), bill);
  if (period && period.level !== 'info') warnings.push(period);
  const duplicate = db.electricityBills.some((b) => b.month === bill.month && b.id !== bill.id);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" aria-hidden />
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{initial.updatedAt ? 'Modifica bolletta luce' : 'Dati bolletta luce'}</CardTitle>
            <CardDescription className="mt-1.5">
              {auto.size > 0 ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Badge variant="warning">Estratto automaticamente · da verificare</Badge>
                  {fileName && <span className="truncate text-xs">{fileName}</span>}
                </span>
              ) : (
                'Compila o correggi i valori della bolletta.'
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Chiudi modulo">
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              await onSave({ ...bill, updatedAt: new Date().toISOString() });
              setSaving(false);
            }}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field id="eb-month" label="Mese di riferimento" className="col-span-2 md:col-span-1">
                <Input id="eb-month" type="month" value={bill.month} onChange={(e) => set('month', e.target.value)} required />
              </Field>
              <Field id="eb-provider" label="Fornitore" auto={isAuto('provider')} className="col-span-2 md:col-span-1">
                <Input id="eb-provider" value={bill.provider ?? ''} onChange={(e) => set('provider', e.target.value)} placeholder="es. Enel Energia" />
              </Field>
              <Field id="eb-start" label="Inizio periodo" auto={isAuto('periodStart')}>
                <Input id="eb-start" type="date" value={bill.periodStart ?? ''} onChange={(e) => set('periodStart', e.target.value)} />
              </Field>
              <Field id="eb-end" label="Fine periodo" auto={isAuto('periodEnd')}>
                <Input id="eb-end" type="date" value={bill.periodEnd ?? ''} onChange={(e) => set('periodEnd', e.target.value)} />
              </Field>
              <Field id="eb-kwh" label="kWh totali" auto={isAuto('totalKwh')}>
                <NumberInput id="eb-kwh" value={bill.totalKwh || null} onValueChange={(v) => set('totalKwh', v ?? 0)} className="tabular" />
              </Field>
              <Field id="eb-total" label="Totale bolletta (€)" auto={isAuto('totalAmount')}>
                <NumberInput id="eb-total" value={bill.totalAmount || null} onValueChange={(v) => set('totalAmount', v ?? 0)} allowNegative className="tabular" />
              </Field>
              <Field id="eb-vatrate" label="Aliquota IVA (%)" auto={isAuto('vatRate')}>
                <NumberInput id="eb-vatrate" value={bill.vatRate || null} onValueChange={(v) => set('vatRate', v ?? 0)} className="tabular" />
              </Field>
              <Field id="eb-vat" label="Importo IVA (€)" auto={isAuto('vatAmount')}>
                <NumberInput id="eb-vat" value={bill.vatAmount || null} onValueChange={(v) => set('vatAmount', v ?? 0)} allowNegative className="tabular" />
              </Field>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Dettaglio voci</h4>
                  <p className="text-xs text-muted-foreground">Importi IVA esclusa. Usa valori negativi per conguagli a credito.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setBill((b) => ({
                      ...b,
                      lines: [...b.lines, { id: uid(), category: 'altre', label: 'Altra voce', consumo: 0, fisso: 0, potenza: 0, vatExempt: false }],
                    }))
                  }
                >
                  <Plus /> Voce
                </Button>
              </div>

              <div className="hidden grid-cols-[1.3fr_1.4fr_repeat(3,minmax(0,1fr))_auto_auto] gap-2 px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                <span>Categoria</span>
                <span>Descrizione</span>
                <span>Consumo €</span>
                <span>Fissa €</span>
                <span>Potenza €</span>
                <span>Esente IVA</span>
                <span className="sr-only">Azioni</span>
              </div>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {bill.lines.map((l, i) => (
                    <motion.li
                      key={l.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/20 p-3 md:grid-cols-[1.3fr_1.4fr_repeat(3,minmax(0,1fr))_auto_auto] md:items-center md:border-0 md:bg-transparent md:p-1"
                    >
                      <div className="col-span-2 md:col-span-1">
                        <label htmlFor={`cat-${l.id}`} className="sr-only">
                          Categoria voce {i + 1}
                        </label>
                        <Select
                          id={`cat-${l.id}`}
                          value={l.category}
                          onChange={(e) => {
                            const category = e.target.value as ElecCategory;
                            setLine(l.id, { category, vatExempt: category === 'rai' ? true : l.vatExempt });
                          }}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <label htmlFor={`lbl-${l.id}`} className="sr-only">
                          Descrizione voce {i + 1}
                        </label>
                        <div className="relative">
                          <Input id={`lbl-${l.id}`} value={l.label} onChange={(e) => setLine(l.id, { label: e.target.value })} />
                          {isAuto(`line:${l.category}`) && (l.consumo || l.fisso || l.potenza) ? (
                            <span className="absolute -top-2 right-1">
                              <AutoBadge show />
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {(['consumo', 'fisso', 'potenza'] as const).map((k) => (
                        <div key={k} className={k === 'consumo' ? 'col-span-2 md:col-span-1' : ''}>
                          <label htmlFor={`${k}-${l.id}`} className="mb-1 block text-[11px] text-muted-foreground md:sr-only">
                            {k === 'consumo' ? 'Quota consumo €' : k === 'fisso' ? 'Quota fissa €' : 'Quota potenza €'}
                          </label>
                          <NumberInput
                            id={`${k}-${l.id}`}
                            value={l[k] || null}
                            onValueChange={(v) => setLine(l.id, { [k]: v ?? 0 })}
                            allowNegative
                            placeholder="0,00"
                            className="tabular"
                          />
                        </div>
                      ))}
                      <label className="flex items-center gap-2 text-xs text-muted-foreground md:justify-center">
                        <input
                          type="checkbox"
                          checked={l.vatExempt}
                          onChange={(e) => setLine(l.id, { vatExempt: e.target.checked })}
                          className="size-4 rounded border-input accent-amber-500"
                        />
                        <span className="md:sr-only">Esente IVA</span>
                      </label>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setBill((b) => ({ ...b, lines: b.lines.filter((x) => x.id !== l.id) }))}
                          aria-label={`Rimuovi voce ${l.label}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>

            <div className="grid gap-4 rounded-2xl border bg-gradient-to-br from-amber-500/5 to-violet-500/5 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Somma voci + IVA</p>
                <p className="font-semibold tabular">{formatEuro(preview.computedTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Costo a consumo</p>
                <p className="font-semibold tabular">{preview.unitCost === null ? '—' : `${formatEuroPrecise(preview.unitCost)}/kWh`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">kWh inquilino</p>
                <p className="font-semibold tabular">{formatKwh(tenantKwh)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quota inquilino (anteprima)</p>
                <p className="text-lg font-semibold tabular text-violet-600 dark:text-violet-300">{formatEuro(preview.tenantTotal)}</p>
              </div>
            </div>

            <WarningList warnings={warnings} hideInfo />
            {duplicate && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Esiste già una bolletta luce per {formatMonth(bill.month, false)}: verrà sostituita.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onCancel}>
                Annulla
              </Button>
              <Button type="submit" variant="elec" disabled={saving || !bill.month}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Salva bolletta
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
