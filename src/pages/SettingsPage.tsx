import { useEffect, useRef, useState } from 'react';
import { Download, LogOut, RefreshCw, RotateCcw, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { AllocationMethod, AllocationRule, AllocationSettings, LineComponent, Settings, VatMode } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/Field';
import { NumberInput } from '@/components/NumberInput';
import { PageHeader } from '@/components/PageHeader';
import { PrivacyNote } from '@/components/PrivacyNote';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SyncIndicator } from '@/components/SyncIndicator';
import { useData, useDb } from '@/state/DataContext';
import { CATEGORIES, CATEGORY_LABELS, COMPONENTS, COMPONENT_LABELS, defaultAllocation, isDatabaseLike, normalizeDatabase } from '@/lib/calc/defaults';
import { freezePaidMonths } from '@/lib/calc/summary';
import { downloadBlob } from '@/lib/utils';
import { todayIso } from '@/lib/format';

const METHOD_LABELS: Record<AllocationMethod, string> = {
  kwh: 'Proporzionale ai kWh',
  half: '50 / 50',
  custom: '% personalizzata',
  excluded: 'Escluso',
};

export function SettingsPage() {
  const db = useDb();
  const { update, connection, disconnect, syncNow, lastSync, readOnly } = useData();
  const [s, setS] = useState<Settings>(db.settings);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [importing, setImporting] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setS(db.settings), [db.settings]);

  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);
  const setRule = (cat: keyof AllocationSettings, comp: LineComponent, patch: Partial<AllocationRule>) =>
    setS((prev) => ({
      ...prev,
      allocation: { ...prev.allocation, [cat]: { ...prev.allocation[cat], [comp]: { ...prev.allocation[cat][comp], ...patch } } },
    }));

  return (
    <div>
      <PageHeader
        title="Impostazioni"
        description={readOnly ? 'Regole di ripartizione in uso e connessione.' : 'Regole di ripartizione, percentuali, backup e connessione.'}
        actions={
          !readOnly && (
            <Button onClick={() => void update((d) => ({ ...freezePaidMonths(d), settings: s }), 'Impostazioni salvate')} disabled={!dirty}>
              <Save /> Salva impostazioni
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Generali</CardTitle>
            <CardDescription>Nomi usati nei messaggi e nei PDF, quota gas e soglia consumi anomali.</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field id="s-tenant" label="Nome inquilino">
              <Input id="s-tenant" value={s.tenantName} onChange={(e) => setS({ ...s, tenantName: e.target.value })} />
            </Field>
            <Field id="s-owner" label="Il tuo nome">
              <Input id="s-owner" value={s.ownerName} onChange={(e) => setS({ ...s, ownerName: e.target.value })} />
            </Field>
            <Field id="s-gas" label="Quota gas inquilino (%)" hint="Predefinito: 35%">
              <NumberInput
                id="s-gas"
                value={s.gasTenantPercent}
                onValueChange={(v) => setS({ ...s, gasTenantPercent: Math.min(100, Math.max(0, v ?? 0)) })}
              />
            </Field>
            <Field id="s-anom" label="Soglia consumo anomalo (%)" hint="Avviso se il consumo supera la media di questa percentuale">
              <NumberInput
                id="s-anom"
                value={s.anomalyThresholdPercent}
                onValueChange={(v) => setS({ ...s, anomalyThresholdPercent: Math.max(0, v ?? 0) })}
              />
            </Field>
            <Field id="s-vat" label="Ripartizione IVA" className="sm:col-span-2">
              <Select id="s-vat" value={s.vatMode} onChange={(e) => setS({ ...s, vatMode: e.target.value as VatMode })}>
                <option value="rate">Aliquota della bolletta applicata alla quota di ciascuno</option>
                <option value="proportional">IVA divisa in proporzione all’imponibile di ciascuno</option>
              </Select>
            </Field>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connessione e backup</CardTitle>
            <CardDescription>
              Repository dati: <code className="rounded bg-muted px-1 py-0.5 text-xs">{connection.owner}/{connection.repo}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SyncIndicator />
              {lastSync && <span className="text-xs text-muted-foreground">Ultima sincronizzazione {new Date(lastSync).toLocaleString('it-IT')}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void syncNow()}>
                <RefreshCw /> Sincronizza ora
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  downloadBlob(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), `utenze-backup-${todayIso()}.json`);
                  toast.success('Backup esportato');
                }}
              >
                <Download /> Esporta JSON
              </Button>
              {!readOnly && (
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload /> Importa JSON
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Importa backup JSON"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const parsed = JSON.parse(await f.text());
                    if (!isDatabaseLike(parsed)) throw new Error('Il file non sembra un backup valido.');
                    setImporting(parsed);
                  } catch (err) {
                    toast.error('Importazione non riuscita', { description: err instanceof Error ? err.message : undefined });
                  }
                }}
              />
            </div>
            <div className="border-t pt-4">
              <Button variant="destructive" onClick={() => setConfirmDisconnect(true)}>
                <LogOut /> Disconnetti
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Cancella token e cache da questo dispositivo. I dati restano al sicuro nel repository privato.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Ripartizione delle voci della luce</CardTitle>
              <CardDescription className="mt-1.5">
                Per ogni voce e componente scegli come dividere l’importo. Le voci “proporzionali ai kWh” formano il costo unitario.
              </CardDescription>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="sm" onClick={() => setS({ ...s, allocation: defaultAllocation() })}>
                <RotateCcw /> Predefiniti
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Metodi di ripartizione per voce</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Voce</th>
                    {COMPONENTS.map((c) => (
                      <th key={c} scope="col" className="px-2 py-2 font-medium">
                        {COMPONENT_LABELS[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {CATEGORIES.map((cat) => (
                    <tr key={cat}>
                      <th scope="row" className="py-3 pr-3 text-left font-medium">
                        {CATEGORY_LABELS[cat]}
                      </th>
                      {COMPONENTS.map((comp) => {
                        const rule = s.allocation[cat][comp];
                        const id = `rule-${cat}-${comp}`;
                        return (
                          <td key={comp} className="px-2 py-3 align-top">
                            <label htmlFor={id} className="sr-only">
                              {CATEGORY_LABELS[cat]} – {COMPONENT_LABELS[comp]}
                            </label>
                            <Select id={id} value={rule.method} onChange={(e) => setRule(cat, comp, { method: e.target.value as AllocationMethod })}>
                              {(Object.keys(METHOD_LABELS) as AllocationMethod[]).map((m) => (
                                <option key={m} value={m}>
                                  {METHOD_LABELS[m]}
                                </option>
                              ))}
                            </Select>
                            {rule.method === 'custom' && (
                              <div className="mt-2 flex items-center gap-2">
                                <NumberInput
                                  id={`${id}-pct`}
                                  aria-label={`Percentuale inquilino ${CATEGORY_LABELS[cat]} ${COMPONENT_LABELS[comp]}`}
                                  value={rule.tenantPercent}
                                  onValueChange={(v) => setRule(cat, comp, { tenantPercent: Math.min(100, Math.max(0, v ?? 0)) })}
                                  className="h-8 w-20"
                                />
                                <span className="text-xs text-muted-foreground">% inquilino</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
            <p className="mt-4 text-xs text-muted-foreground">
              L’IVA viene calcolata a parte secondo l’impostazione “Ripartizione IVA”. Le voci segnate come esenti (es. canone RAI) non
              concorrono all’imponibile. Le modifiche valgono per i mesi ancora da pagare: i mesi già segnati come pagati restano
              calcolati con le regole in vigore al momento del pagamento.
            </p>
          </CardContent>
        </Card>
      </div>

      <PrivacyNote className="mt-6" owner={connection.owner} repo={connection.repo} />

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnettere questo dispositivo?"
        description="Il token e la cache locale verranno cancellati da questo dispositivo. Potrai riconnetterti in qualsiasi momento."
        confirmLabel="Disconnetti"
        destructive
        onConfirm={disconnect}
      />
      <ConfirmDialog
        open={importing !== null}
        onOpenChange={(o) => !o && setImporting(null)}
        title="Importare il backup?"
        description="I dati attuali verranno sostituiti con quelli del file e sincronizzati sul repository privato."
        confirmLabel="Importa"
        onConfirm={() => {
          const data = normalizeDatabase(importing);
          void update(() => data, 'Backup importato');
        }}
      />
    </div>
  );
}
