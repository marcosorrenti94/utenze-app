import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { CalcWarning } from '@/lib/calc/electricity';
import { cn } from '@/lib/utils';

const STYLES = {
  error: { icon: AlertCircle, cls: 'border-red-500/25 bg-red-500/5 text-red-700 dark:text-red-300' },
  warning: { icon: AlertTriangle, cls: 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300' },
  info: { icon: Info, cls: 'border-sky-500/25 bg-sky-500/5 text-sky-800 dark:text-sky-300' },
};

export function WarningList({ warnings, hideInfo = false }: { warnings: CalcWarning[]; hideInfo?: boolean }) {
  const list = hideInfo ? warnings.filter((w) => w.level !== 'info') : warnings;
  if (!list.length) return null;
  return (
    <ul className="space-y-2" aria-label="Avvisi">
      {list.map((w, i) => {
        const S = STYLES[w.level];
        return (
          <li key={`${w.code}-${i}`} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', S.cls)}>
            <S.icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{w.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
