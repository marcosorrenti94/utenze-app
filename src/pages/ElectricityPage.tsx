import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator, FileText, PenLine, Pencil, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { ElectricityBill } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { FileDropzone } from '@/components/FileDropzone';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ElectricityBillForm } from '@/components/ElectricityBillForm';
import { useData, useDb } from '@/state/DataContext';
import { emptyElectricityLines, extractPdfText, parseElectricityBill } from '@/lib/parsers';
import { currentMonth, formatDate, formatEuro, formatKwh, formatMonth } from '@/lib/format';
import { openBlob, uid } from '@/lib/utils';
import type { Route } from '@/hooks/useHashRoute';

function blankBill(month = currentMonth()): ElectricityBill {
  return {
    id: uid(),
    month,
    totalKwh: 0,
    totalAmount: 0,
    vatRate: 10,
    vatAmount: 0,
    lines: emptyElectricityLines(),
    autoExtracted: [],
    createdAt: new Date().toISOString(),
  };
}

export function ElectricityPage({ navigate }: { navigate: (r: Route, p?: string) => void }) {
  const db = useDb();
  const { update, uploadFile, getFile, deleteFile } = useData();
  const [draft, setDraft] = useState<ElectricityBill | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [deleting, setDeleting] = useState<ElectricityBill | null>(null);

  const bills = [...db.electricityBills].sort((a, b) => b.month.localeCompare(a.month));

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Carica un file PDF');
      return;
    }
    setParsing(true);
    setPdf(file);
    try {
      const text = await extractPdfText(await file.arrayBuffer());
      const r = parseElectricityBill(text);
      const base = blankBill(r.month ?? currentMonth());
      const extracted = [...r.extracted];
      if (r.provider) extracted.push('provider');
      setDraft({
        ...base,
        provider: r.provider ?? undefined,
        periodStart: r.periodStart ?? undefined,
        periodEnd: r.periodEnd ?? undefined,
        totalKwh: r.totalKwh ?? 0,
        totalAmount: r.totalAmount ?? 0,
        vatRate: r.vatRate ?? 10,
        vatAmount: r.vatAmount ?? 0,
        lines: r.lines,
        autoExtracted: extracted,
      });
      if (r.ok) toast.success('Dati estratti dal PDF', { description: 'Verifica i valori evidenziati prima di salvare.' });
      else toast.warning('Non sono riuscito a leggere i dati', { description: 'Compila il modulo manualmente.' });
    } catch (e) {
      setDraft(blankBill());
      toast.error('Impossibile leggere il PDF', { description: e instanceof Error ? e.message : 'Compila il modulo manualmente.' });
    } finally {
      setParsing(false);
    }
  }

  async function save(bill: ElectricityBill) {
    let pdfPath = bill.pdfPath;
    if (pdf) {
      const path = `bills/${bill.month}-luce.pdf`;
      if (await uploadFile(path, await pdf.arrayBuffer(), `Bolletta luce ${bill.month}`)) pdfPath = path;
    }
    const ok = await update((d) => {
      d.electricityBills = d.electricityBills.filter((b) => b.id !== bill.id && b.month !== bill.month);
      d.electricityBills.push({ ...bill, ...(pdfPath ? { pdfPath } : {}) });
      return d;
    }, `Bolletta luce di ${formatMonth(bill.month, false)} salvata`);
    if (ok) {
      setDraft(null);
      setPdf(null);
    }
  }

  async function openPdf(path: string) {
    const t = toast.loading('Scarico il PDF…');
    try {
      openBlob(await getFile(path));
      toast.dismiss(t);
    } catch (e) {
      toast.error('Impossibile aprire il PDF', { id: t, description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div>
      <PageHeader
        title="Bollette luce"
        description="Carica il PDF: i dati vengono letti nel browser e puoi correggerli prima di salvare."
        actions={
          !draft && (
            <Button variant="outline" onClick={() => setDraft(blankBill())}>
              <PenLine /> Inserisci manualmente
            </Button>
          )
        }
      />

      <div className="space-y-6">
        {draft ? (
          <ElectricityBillForm
            key={draft.id}
            initial={draft}
            fileName={pdf?.name}
            onCancel={() => {
              setDraft(null);
              setPdf(null);
            }}
            onSave={save}
          />
        ) : (
          <FileDropzone
            accept="application/pdf,.pdf"
            label="Trascina qui il PDF della bolletta luce"
            hint="Periodo, kWh, totale e voci vengono riconosciuti automaticamente"
            accent="elec"
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
              <EmptyState icon={Zap} tone="elec" title="Nessuna bolletta luce" description="Carica il primo PDF o inserisci i dati manualmente." />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {bills.map((b, i) => (
                  <motion.li
                    key={b.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="group rounded-xl border bg-card p-4 transition-shadow hover:shadow-lift"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{formatMonth(b.month)}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.periodStart && b.periodEnd ? `${formatDate(b.periodStart)} – ${formatDate(b.periodEnd)}` : 'Periodo non indicato'}
                        </p>
                      </div>
                      {b.provider && <Badge variant="elec">{b.provider}</Badge>}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <p className="text-xl font-semibold tabular">{formatEuro(b.totalAmount)}</p>
                      <p className="text-sm text-muted-foreground tabular">{formatKwh(b.totalKwh)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
                      <Button variant="ghost" size="sm" onClick={() => navigate('riepilogo', b.month)}>
                        <Calculator /> Calcolo
                      </Button>
                      {b.pdfPath && (
                        <Button variant="ghost" size="sm" onClick={() => void openPdf(b.pdfPath!)}>
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
                      <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => setDeleting(b)} aria-label={`Elimina bolletta ${formatMonth(b.month)}`}>
                        <Trash2 />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminare la bolletta?"
        description={deleting ? `La bolletta luce di ${formatMonth(deleting.month, false)} e il relativo PDF verranno eliminati.` : ''}
        confirmLabel="Elimina"
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const target = deleting;
          void update((d) => {
            d.electricityBills = d.electricityBills.filter((b) => b.id !== target.id);
            return d;
          }, 'Bolletta eliminata').then((ok) => {
            if (ok && target.pdfPath) void deleteFile(target.pdfPath);
          });
        }}
      />
    </div>
  );
}
