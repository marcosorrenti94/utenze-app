import { Sparkles } from 'lucide-react';

/** Indicatore per i campi compilati dal parser PDF. */
export function AutoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
      title="Estratto automaticamente dal PDF: da verificare"
    >
      <Sparkles className="size-2.5" aria-hidden />
      auto · da verificare
    </span>
  );
}
