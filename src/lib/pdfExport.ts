import type { Settings } from '@/types';
import type { MonthSummary } from '@/lib/calc/summary';
import { formatDate, formatEuro, formatEuroPrecise, formatKwh, formatMonth, formatNumber } from './format';

// jsPDF con i font standard non gestisce gli spazi speciali di Intl
const t = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2192]/g, '->').replace(/[\u2013\u2014]/g, '-');

const AMBER: [number, number, number] = [245, 158, 11];
const CYAN: [number, number, number] = [6, 182, 212];
const VIOLET: [number, number, number] = [139, 92, 246];

/** Genera e scarica il PDF del riepilogo mensile. jsPDF viene caricato solo al bisogno. */
export async function exportMonthPdf(summary: MonthSummary, settings: Settings): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 18;

  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W / 2, 4, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(W / 2, 0, W / 2, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(t(`Riepilogo utenze - ${formatMonth(summary.month)}`), 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(t(`${settings.ownerName} -> ${settings.tenantName} · generato il ${formatDate(new Date().toISOString())}`), 14, y);
  doc.setTextColor(0);
  y += 10;

  // Box totale
  doc.setDrawColor(...VIOLET);
  doc.setFillColor(245, 243, 255);
  doc.roundedRect(14, y, W - 28, 20, 3, 3, 'FD');
  doc.setFontSize(10);
  doc.text('Totale dovuto dall\'inquilino', 20, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(t(formatEuro(summary.tenantTotal)), W - 20, y + 9, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const status = summary.payment.paid
    ? `Pagato${summary.payment.date ? ` il ${formatDate(summary.payment.date)}` : ''}`
    : 'Da pagare';
  doc.text(t(`Luce ${formatEuro(summary.electricity?.tenantTotal ?? 0)} + Gas ${formatEuro(summary.gas?.tenantTotal ?? 0)} · ${status}`), 20, y + 15);
  y += 28;

  const e = summary.electricity;
  const b = summary.electricityBill;
  if (e && b) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Luce', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    y += 5;
    const info = [
      b.periodStart && b.periodEnd ? `Periodo ${formatDate(b.periodStart)} - ${formatDate(b.periodEnd)}` : null,
      `Bolletta ${formatEuro(e.billTotal)} · ${formatKwh(e.billKwh)}`,
      `Consumo inquilino ${formatKwh(e.tenantKwh)}`,
      e.unitCost !== null ? `Costo unitario ${formatEuroPrecise(e.unitCost)}/kWh` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    doc.text(t(info), 14, y);
    y += 3;

    autoTable(doc, {
      startY: y + 2,
      head: [['Voce', 'Importo', 'Criterio', 'Inquilino', 'Proprietario']],
      body: [
        ...e.rows.map((r) => [t(r.label), t(formatEuro(r.amount)), t(r.criterion), t(formatEuro(r.tenant)), t(formatEuro(r.owner))]),
        [
          t(`IVA ${formatNumber(e.vat.rate)}%`),
          t(formatEuro(e.vat.amount)),
          e.vat.mode === 'rate' ? 'Aliquota sulla quota di ciascuno' : 'Proporzionale all\'imponibile',
          t(formatEuro(e.vat.tenant)),
          t(formatEuro(e.vat.owner)),
        ],
      ],
      foot: [['Totale luce (arrotondato)', t(formatEuro(e.billTotal || e.computedTotal)), '', t(formatEuro(e.tenantTotal)), t(formatEuro(e.ownerTotal))]],
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: AMBER, textColor: 20 },
      footStyles: { fillColor: [250, 250, 250], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  const g = summary.gas;
  if (g && summary.gasBill) {
    if (y > 250) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Gas', 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [['Periodo', 'Smc', 'Totale bolletta', 'Quota inquilino', 'Inquilino', 'Proprietario']],
      body: [
        [
          summary.gasBill.periodStart && summary.gasBill.periodEnd
            ? t(`${formatDate(summary.gasBill.periodStart)} - ${formatDate(summary.gasBill.periodEnd)}`)
            : '-',
          formatNumber(summary.gasBill.smc),
          t(formatEuro(g.total)),
          `${formatNumber(g.percent)}%`,
          t(formatEuro(g.tenantTotal)),
          t(formatEuro(g.ownerTotal)),
        ],
      ],
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: CYAN, textColor: 20 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    t('Le voci a consumo sono ripartite in base ai kWh del contascatti; quote fisse, potenza e trasporto al 50%. Solo il totale è arrotondato al centesimo.'),
    14,
    Math.min(y, 285),
    { maxWidth: W - 28 },
  );

  doc.save(`riepilogo-utenze-${summary.month}.pdf`);
}
