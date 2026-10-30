import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { FileText, Flame, Loader2, PenLine, Pencil, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GasBill } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { FileDropzone } from '@/components/FileDropzone';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { NumberInput } from '@/components/NumberInput';
import { useData, useDb } from '@/state/DataContext';
import { extractPdfText, parseGasBill } from '@/lib/parsers';
import { computeGas } from '@/lib/calc/gas';
import { calcSettingsForMonth } from '@/lib/calc/summary';
import { currentMonth, formatDate, formatEuro, formatMonth, formatNumber } from '@/lib/format';
import { openBlob, uid } from '@/lib/utils';

function blankGas(month = currentMonth()): GasBill {
  return { id: uid(), month, smc: 0, totalAmount: 0, autoExtracted: [], createdAt: new Date().toISOString() };
}

export function GasPage() {
  const db = useDb();
  const { update, uploadFile, getFile, deleteFile } = useData();
  const [draft, setDraft] = useState<GasBill | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<GasBill | null>(null);
  const percent = db.settings.gasTenantPercent;
  const bills = [...db.gasBills].sort((a, b) => b.month.localeCompare(a.month));
  const auto = new Set(draft?.autoExtracted ?? []);

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Carica un file PDF');
      return;
    }
    setParsing(true);
    setPdf(file);
    try {
      const r = parseGasBill(await extractPdfText(await file.arrayBuffer()));
      const extracted = [...r.extracted];
      if (r.provider) extracted.push('provider');
      setDraft({
        ...blankGas(r.month ?? currentMonth()),
        provider: r.provider ?? undefined,
        periodStart: r.periodStart ?? undefined,
        periodEnd: r.periodEnd ?? undefined,
        smc: r.smc ?? 0,
        totalAmount: r.totalAmount ?? 0,
        autoExtracted: extracted,
      });
      if (r.ok) toast.success('Dati estratti dal PDF', { description: 'Verifica i valori prima di salvare.' });
      else toast.warning('Non sono riuscito a leggere i dati', { description: 'Compila il modulo manualmente.' });
    } catch (e) {
      setDraft(blankGas());
      toast.error('Impossibile leggere il PDF', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setParsing(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    let pdfPath = draft.pdfPath;
    if (pdf) {
      const path = `bills/${draft.month}-gas.pdf`;
      if (await uploadFile(path, await pdf.arrayBuffer(), `Bolletta gas ${draft.month}`)) pdfPath = path;
    }
    const bill = { ...draft, ...(pdfPath ? { pdfPath } : {}), updatedAt: new Date().toISOString() };
    const ok = await update((d) => {
      d.gasBills = d.gasBills.filter((b) => b.id !== bill.id && b.month !== bill.month);
      d.gasBills.push(bill);
      return d;
    }, `Bolletta gas di ${formatMonth(bill.month, false)} salvata`);
    setSaving(false);
    if (ok) {
      setDraft(null);
      setPdf(null);
    }
  }

  const preview = draft ? computeGas(draft, calcSettingsForMonth(db, draft.month).gasTenantPercent) : null;
  const set = <K extends keyof GasBill>(k: K, v: GasBill[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div>
      <PageHeader
        title="Bollette gas"
        description={`L’inquilino paga il ${formatNumber(percent)}% dell’importo totale (modificabile nelle Impostazioni).`}
        actions={
          !draft && (
            <Button variant="outline" onClick={() => setDraft(blankGas())}>
              <PenLine /> Inserisci manualmente
            </Button>
          )
        }
      />

      <div className="space-y-6">
        {draft ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-cyan-400 to-blue-500" aria-hidden />
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Dati bolletta gas</CardTitle>
                  <CardDescription className="mt-1.5">
                    {auto.size ? <Badge variant="warning">Estratto automaticamente · da verificare</Badge> : 'Compila o correggi i valori.'}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDraft(null)} aria-label="Chiudi modulo">
                  <X />
                </Button>
              </CardHeader>
              <CardContent>
                <form onSubmit={save} className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <Field id="g-month" label="Mese di riferimento">
                      <Input id="g-month" type="month" value={draft.month} onChange={(e) => set('month', e.target.value)} required />
                    </Field>
                    <Field id="g-provider" label="Fornitore" auto={auto.has('provider')}>
                      <Input id="g-provider" value={draft.provider ?? ''} onChange={(e) => set('provider', e.target.value)} />
                    </Field>
                    <Field id="g-start" label="Inizio periodo" auto={auto.has('periodStart')}>
                      <Input id="g-start" type="date" value={draft.periodStart ?? ''} onChange={(e) => set('periodStart', e.target.value)} />
                    </Field>
                    <Field id="g-end" label="Fine periodo" auto={auto.has('periodEnd')}>
                      <Input id="g-end" type="date" value={draft.periodEnd ?? ''} onChange={(e) => set('periodEnd', e.target.value)} />
                    </Field>
                    <Field id="g-smc" label="Consumo (Smc)" auto={auto.has('smc')}>
                      <NumberInput id="g-smc" value={draft.smc || null} onValueChange={(v) => set('smc', v ?? 0)} className="tabular" />
                    </Field>
                    <Field id="g-total" label="Totale bolletta (€)" auto={auto.has('totalAmount')}>
                      <NumberInput id="g-total" value={draft.totalAmount || null} onValueChange={(v) => set('totalAmount', v ?? 0)} allowNegative className="tabular" />
                    </Field>
                  </div>
                  {preview && (
                    <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-gradient-to-br from-cyan-500/5 to-violet-500/5 p-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Quota inquilino ({formatNumber(preview.percent)}%)</p>
                        <p className="text-xl font-semibold tabular text-violet-600 dark:text-violet-300">{formatEuro(preview.tenantTotal)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Quota mia</p>
                        <p className="text-xl font-semibold tabular text-emerald-600 dark:text-emerald-400">{formatEuro(preview.ownerTotal)}</p>
                      </div>
                    </div>
                  )}
                  {db.gasBills.some((b) => b.month === draft.month && b.id !== draft.id) && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Esiste già una bolletta gas per {formatMonth(draft.month, false)}: verrà sostituita.
                    </p>
                  )}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={() => setDraft(null)}>
                      Annulla
                    </Button>
                    <Button type="submit" variant="gas" disabled={saving}>
                      {saving ? <Loader2 className="animate-spin" /> : <Save />}
                      Salva bolletta
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <FileDropzone
            accept="application/pdf,.pdf"
            label="Trascina qui il PDF della bolletta gas"
            hint="Periodo, Smc e importo totale vengono riconosciuti automaticamente"
            accent="gas"
            loading={parsing}
            onFile={(f) => void handleFile(f)}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Storico bollette</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            {bills.length === 0 ? (
              <EmptyState icon={Flame} tone="gas" title="Nessuna bolletta gas" description="Carica il primo PDF o inserisci i dati manualmente." />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {bills.map((b) => {
                  const g = computeGas(b, calcSettingsForMonth(db, b.month).gasTenantPercent);
                  return (
                    <li key={b.id} className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-lift">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{formatMonth(b.month)}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.periodStart && b.periodEnd ? `${formatDate(b.periodStart)} – ${formatDate(b.periodEnd)}` : 'Periodo non indicato'}
                          </p>
                        </div>
                        {b.provider && <Badge variant="gas">{b.provider}</Badge>}
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <p className="text-xl font-semibold tabular">{formatEuro(b.totalAmount)}</p>
                        <p className="text-sm text-muted-foreground tabular">{b.smc ? `${formatNumber(b.smc)} Smc` : ''}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Inquilino <span className="font-medium text-violet-600 dark:text-violet-300 tabular">{formatEuro(g.tenantTotal)}</span>
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
                        {b.pdfPath && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                openBlob(await getFile(b.pdfPath!));
                              } catch (e) {
                                toast.error('Impossibile aprire il PDF', { description: e instanceof Error ? e.message : undefined });
                              }
                            }}
                          >
                            <FileText /> PDF
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPdf(null);
                            setDraft({ ...b, autoExtracted: [] });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <Pencil /> Modifica
                        </Button>
                        <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => setDeleting(b)} aria-label={`Elimina bolletta gas ${formatMonth(b.month)}`}>
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminare la bolletta gas?"
        description={deleting ? `La bolletta gas di ${formatMonth(deleting.month, false)} e il relativo PDF verranno eliminati.` : ''}
        confirmLabel="Elimina"
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const target = deleting;
          void update((d) => {
            d.gasBills = d.gasBills.filter((b) => b.id !== target.id);
            return d;
          }, 'Bolletta eliminata').then((ok) => {
            if (ok && target.pdfPath) void deleteFile(target.pdfPath);
          });
        }}
      />
    </div>
  );
}
