import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useData } from '@/state/DataContext';
import { cn } from '@/lib/utils';

const CONFIG = {
  synced: { label: 'Sincronizzato', icon: Check, cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  syncing: { label: 'Sincronizzazione…', icon: Loader2, cls: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20' },
  offline: { label: 'Offline', icon: CloudOff, cls: 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10 border-zinc-500/20' },
  error: { label: 'Errore', icon: AlertTriangle, cls: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20' },
  idle: { label: 'In attesa', icon: RefreshCw, cls: 'text-muted-foreground bg-muted border-border' },
} as const;

export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const { status, pending, syncNow, error, lastSync } = useData();
  const c = CONFIG[status];
  const Icon = c.icon;
  const title = [
    c.label,
    pending ? 'modifiche locali da inviare' : null,
    error,
    lastSync ? `ultima sincronizzazione ${new Date(lastSync).toLocaleTimeString('it-IT')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={`${title}. Clicca per sincronizzare.`}
      aria-label={`Stato sincronizzazione: ${title}. Sincronizza ora`}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors hover:opacity-90',
        c.cls,
      )}
    >
      <Icon className={cn('size-3.5', status === 'syncing' && 'animate-spin')} aria-hidden />
      {!compact && <span>{c.label}</span>}
      {pending && status !== 'syncing' && <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {c.label}
      </span>
    </button>
  );
}
