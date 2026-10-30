import type { Settings } from '@/types';
import type { MonthSummary } from '@/lib/calc/summary';
import { formatDate, formatEuro, formatEuroPrecise, formatKwh, formatMonth, formatNumber } from './format';

const clean = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

/** Messaggio pronto per WhatsApp/email con il dettaglio del calcolo. */
export function buildShareMessage(summary: MonthSummary, settings: Settings): string {
  const out: string[] = [];
  out.push(`Ciao ${settings.tenantName}, ecco il riepilogo delle utenze di ${formatMonth(summary.month, false)}.`);
  out.push('');

  const e = summary.electricity;
  if (e && summary.electricityBill) {
    const b = summary.electricityBill;
    out.push('⚡ LUCE');
    if (b.periodStart && b.periodEnd) out.push(`Periodo bolletta: ${formatDate(b.periodStart)} – ${formatDate(b.periodEnd)}`);
    out.push(`Bolletta totale: ${formatEuro(e.billTotal)} per ${formatKwh(e.billKwh)}`);
    if (summary.reading) {
      const prev = summary.reading.value - (summary.tenantKwh ?? 0);
      out.push(
        `Contascatti: ${formatNumber(prev)} → ${formatNumber(summary.reading.value)} kWh = ${formatKwh(summary.tenantKwh)} consumati da te`,
      );
    }
    if (e.unitCost !== null) {
      out.push(`Costo a consumo (energia, oneri, accise): ${formatEuroPrecise(e.unitCost)}/kWh × ${formatKwh(e.tenantKwh)} = ${formatEuro(e.tenantKwhCost)}`);
    }
    const halfTenant = e.rows.filter((r) => r.method !== 'kwh').reduce((s, r) => s + r.tenant, 0);
    if (halfTenant !== 0) out.push(`Quote fisse, potenza, trasporto e altre voci ripartite: ${formatEuro(halfTenant)}`);
    if (e.vat.tenant !== 0) out.push(`IVA ${formatNumber(e.vat.rate)}% sulla tua quota: ${formatEuro(e.vat.tenant)}`);
    out.push(`Totale luce a tuo carico: ${formatEuro(e.tenantTotal)}`);
    out.push('');
  }

  const g = summary.gas;
  if (g && summary.gasBill) {
    out.push('🔥 GAS');
    out.push(`Bolletta totale: ${formatEuro(g.total)}${summary.gasBill.smc ? ` (${formatNumber(summary.gasBill.smc)} Smc)` : ''}`);
    out.push(`Quota a tuo carico (${formatNumber(g.percent)}%): ${formatEuro(g.tenantTotal)}`);
    out.push('');
  }

  out.push(`💶 TOTALE DA PAGARE: ${formatEuro(summary.tenantTotal)}`);
  if (summary.payment.paid) {
    out.push(`✅ Pagato${summary.payment.date ? ` il ${formatDate(summary.payment.date)}` : ''}. Grazie!`);
  } else {
    out.push('Grazie!');
  }
  out.push('');
  out.push(settings.ownerName);
  return clean(out.join('\n'));
}
