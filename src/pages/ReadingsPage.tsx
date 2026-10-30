import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Flag, Gauge, ImageIcon, Loader2, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import type { Reading } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/Field';
import { NumberInput } from '@/components/NumberInput';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useData, useDb } from '@/state/DataContext';
import { useNames } from '@/hooks/useNames';
import { validateReading, withConsumption } from '@/lib/calc/readings';
import { currentMonth, formatDate, formatKwh, formatMonth, formatNumber, todayIso } from '@/lib/format';
import { cn, fileExtension, openBlob, uid } from '@/lib/utils';

interface FormState {
  month: string;
  date: string;
  value: number | null;
  photo: File | null;
}

function ConsumptionPreview({ consumption, average }: { consumption: number | null; average: number | null }) {
  if (consumption === null) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3"
      aria-live="polite"
    >
      <div>
        <p className="text-xs text-muted-foreground">Consumo del mese</p>
        <p className="text-2xl font-semibold tabular text-violet-700 dark:text-violet-300">{formatKwh(consumption)}</p>
      </div>
      {average !== null && (
        <div className="text-right text-xs text-muted-foreground">
          <p>Media ultimi mesi</p>
          <p className="font-medium tabular text-foreground">{formatKwh(average)}</p>
        </div>
      )}
    </motion.div>
  );
}

function PhotoInput({ file, onChange, id }: { file: File | null; onChange: (f: File | null) => void; id: string }) {
  return (
    <Field id={id} label="Foto del contascatti (facoltativa)" hint="Solo come prova: non viene letta automaticamente.">
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring"
      >
        <Camera className="size-4" aria-hidden />
        <span className="truncate">{file ? file.name : 'Scatta o scegli una foto'}</span>
        <input
          id={id}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
    </Field>
  );
}

export function ReadingsPage() {
  const names = useNames();
  const db = useDb();
  const { update, uploadFile, getFile, deleteFile, readOnly } = useData();
  const readings = useMemo(() => withConsumption(db.readings), [db.readings]);
  const initial = readings.find((r) => r.isInitial) ?? null;
  const threshold = db.settings.anomalyThresholdPercent;

  const [form, setForm] = useState<FormState>({ month: currentMonth(), date: todayIso(), value: null, photo: null });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Reading | null>(null);
  const [deleting, setDeleting] = useState<Reading | null>(null);

  const validation = useMemo(
    () =>
      validateReading(
        db.readings,
        { month: form.month, date: form.date, value: form.value ?? NaN, isInitial: !initial },
        threshold,
      ),
    [db.readings, form, initial, threshold],
  );

  async function savePhoto(file: File | null, month: string, id: string): Promise<string | undefined> {
    if (!file) return undefined;
    const path = `photos/${month}-${id.slice(0, 8)}.${fileExtension(file.name, 'jpg')}`;
    const ok = await uploadFile(path, await file.arrayBuffer(), `Foto contascatti ${month}`);
    return ok ? path : undefined;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.value === null || validation.errors.length) return;
    setSaving(true);
    const id = uid();
    const photoPath = await savePhoto(form.photo, form.month, id);
    const reading: Reading = {
      id,
      month: form.month,
      date: form.date,
      value: form.value,
      isInitial: !initial,
      ...(photoPath ? { photoPath } : {}),
    };
    const ok = await update((d) => {
      d.readings.push(reading);
      return d;
    }, initial ? `Lettura di ${formatMonth(form.month, false)} salvata` : 'Lettura iniziale salvata');
    setSaving(false);
    if (ok) setForm({ month: nextMonth(form.month), date: todayIso(), value: null, photo: null });
  }

  async function viewPhoto(path: string) {
    const t = toast.loading('Scarico la foto…');
    try {
      openBlob(await getFile(path));
      toast.dismiss(t);
    } catch (e) {
      toast.error('Impossibile aprire la foto', { id: t, description: e instanceof Error ? e.message : undefined });
    }
  }

  const history = [...readings].reverse();

  return (
    <div>
      <PageHeader
        title="Letture contascatti"
        description={
          readOnly
            ? `Valori cumulativi in kWh del sottocontatore di ${names.tenant} e consumo di ogni mese.`
            : `Inserisci ogni mese il valore cumulativo in kWh del sottocontatore di ${names.tenant}.`
        }
      />

      <div className={cn('grid gap-6', !readOnly && 'lg:grid-cols-[minmax(0,420px)_1fr]')}>
        <Card className={cn('h-fit lg:sticky lg:top-10', readOnly && 'hidden')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {initial ? <Plus className="size-4 text-violet-500" /> : <Flag className="size-4 text-violet-500" />}
              {initial ? 'Nuova lettura' : 'Lettura iniziale'}
            </CardTitle>
            <CardDescription>
              {initial
                ? `Ultima lettura: ${formatNumber(readings[readings.length - 1]?.value)} kWh del ${formatDate(readings[readings.length - 1]?.date)}`
                : 'Inserisci il valore di partenza del contascatti: da qui verranno calcolati i consumi.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <Field id="r-month" label="Mese di riferimento">
                  <Input id="r-month" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required />
                </Field>
                <Field id="r-date" label="Data lettura">
                  <Input id="r-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </Field>
              </div>
              <Field id="r-value" label="Lettura cumulativa (kWh)">
                <div className="relative">
                  <NumberInput
                    id="r-value"
                    value={form.value}
                    onValueChange={(v) => setForm({ ...form, value: v })}
                    placeholder="es. 12345,6"
                    className="h-14 pr-14 text-2xl font-semibold tabular"
                    aria-invalid={validation.errors.length > 0 && form.value !== null}
                    required
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">kWh</span>
                </div>
              </Field>

              <AnimatePresence>
                {initial && form.value !== null && <ConsumptionPreview consumption={validation.consumption} average={validation.average} />}
              </AnimatePresence>

              {form.value !== null && (validation.errors.length > 0 || validation.warnings.length > 0) && (
                <ul className="space-y-1.5 text-xs" aria-live="polite">
                  {validation.errors.map((m) => (
                    <li key={m} className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-red-700 dark:text-red-300" role="alert">
                      {m}
                    </li>
                  ))}
                  {validation.warnings.map((m) => (
                    <li key={m} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-800 dark:text-amber-300">
                      <TrendingUp className="mt-0.5 size-3.5 shrink-0" /> {m}
                    </li>
                  ))}
                </ul>
              )}

              <PhotoInput id="r-photo" file={form.photo} onChange={(f) => setForm({ ...form, photo: f })} />

              <Button type="submit" size="lg" className="w-full" disabled={saving || form.value === null || validation.errors.length > 0}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                {initial ? 'Salva lettura' : 'Salva lettura iniziale'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storico letture</CardTitle>
            <CardDescription>{readings.length} letture registrate</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            {history.length === 0 ? (
              <EmptyState icon={Gauge} tone="tenant" title="Nessuna lettura" description="Inizia inserendo la lettura iniziale del contascatti." />
            ) : (
              <ul className="divide-y">
                <AnimatePresence initial={false}>
                  {history.map((r) => (
                    <motion.li
                      key={r.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 px-2 py-3"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                        {r.isInitial ? <Flag className="size-4" /> : <Gauge className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {formatMonth(r.month)}
                          {r.isInitial && <Badge variant="tenant">Iniziale</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(r.date)} · <span className="tabular">{formatNumber(r.value)} kWh</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular">{r.consumption === null ? '—' : `+${formatKwh(r.consumption)}`}</p>
                        <p className="text-[11px] text-muted-foreground">consumo</p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        {r.photoPath && (
                          <Button variant="ghost" size="icon" onClick={() => void viewPhoto(r.photoPath!)} aria-label={`Vedi foto ${formatMonth(r.month)}`}>
                            <ImageIcon />
                          </Button>
                        )}
                        {!readOnly && (
                        <>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label={`Modifica lettura ${formatMonth(r.month)}`}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (r.isInitial && readings.length > 1) {
                              toast.error('Elimina prima le altre letture', {
                                description: 'La lettura iniziale serve come base per i consumi.',
                              });
                              return;
                            }
                            setDeleting(r);
                          }}
                          aria-label={`Elimina lettura ${formatMonth(r.month)}`}
                        >
                          <Trash2 />
                        </Button>
                        </>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && (
        <EditReadingDialog
          reading={editing}
          onClose={() => setEditing(null)}
          onSave={async (next, photo) => {
            const photoPath = (await savePhoto(photo, next.month, next.id)) ?? next.photoPath;
            const ok = await update((d) => {
              d.readings = d.readings.map((x) => (x.id === next.id ? { ...next, ...(photoPath ? { photoPath } : {}) } : x));
              return d;
            }, 'Lettura aggiornata');
            if (ok) setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminare la lettura?"
        description={
          deleting
            ? `La lettura di ${formatMonth(deleting.month, false)} (${formatNumber(deleting.value)} kWh) verrà eliminata.` +
              (readings.some((r) => !r.isInitial && r.date > deleting.date)
                ? ' Il consumo del mese successivo comprenderà anche questo mese.'
                : '')
            : ''
        }
        confirmLabel="Elimina"
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const target = deleting;
          void update((d) => {
            d.readings = d.readings.filter((x) => x.id !== target.id);
            return d;
          }, 'Lettura eliminata').then((ok) => {
            if (ok && target.photoPath) void deleteFile(target.photoPath);
          });
        }}
      />
    </div>
  );
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function EditReadingDialog({
  reading,
  onClose,
  onSave,
}: {
  reading: Reading;
  onClose: () => void;
  onSave: (r: Reading, photo: File | null) => Promise<void>;
}) {
  const db = useDb();
  const [month, setMonth] = useState(reading.month);
  const [date, setDate] = useState(reading.date);
  const [value, setValue] = useState<number | null>(reading.value);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const v = validateReading(
    db.readings,
    { id: reading.id, month, date, value: value ?? NaN, isInitial: reading.isInitial },
    db.settings.anomalyThresholdPercent,
  );
  // Per la lettura iniziale verifica che non superi la prima lettura successiva
  const extraErrors: string[] = [];
  if (reading.isInitial && value !== null) {
    const first = withConsumption(db.readings).find((r) => !r.isInitial);
    if (first && value > first.value) extraErrors.push(`Non può superare la prima lettura (${formatNumber(first.value)} kWh).`);
  }
  const errors = [...v.errors, ...extraErrors];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica lettura</DialogTitle>
          <DialogDescription>{reading.isInitial ? 'Lettura iniziale di partenza' : formatMonth(reading.month)}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (value === null || errors.length) return;
            setSaving(true);
            await onSave({ ...reading, month, date, value }, photo);
            setSaving(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id="e-month" label="Mese">
              <Input id="e-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
            <Field id="e-date" label="Data">
              <Input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field id="e-value" label="Lettura cumulativa (kWh)" error={errors[0] ?? null}>
            <NumberInput id="e-value" value={value} onValueChange={setValue} className="tabular" />
          </Field>
          {!reading.isInitial && v.consumption !== null && (
            <p className="text-sm text-muted-foreground">
              Consumo: <strong className="tabular text-foreground">{formatKwh(v.consumption)}</strong>
            </p>
          )}
          {v.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-300">
              {w}
            </p>
          ))}
          <PhotoInput id="e-photo" file={photo} onChange={setPhoto} />
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={saving || value === null || errors.length > 0}>
              {saving && <Loader2 className="animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
