import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PrivacyNote({ owner, repo, className }: { owner?: string; repo?: string; className?: string }) {
  return (
    <div className={cn('flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm', className)} role="note">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <div className="space-y-1 text-muted-foreground">
        <p className="font-medium text-foreground">Dove sono salvati i tuoi dati</p>
        <p>
          Letture, bollette (PDF) e calcoli sono salvati <strong>solo</strong> nel tuo repository GitHub privato
          {owner && repo ? (
            <>
              {' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {owner}/{repo}
              </code>
            </>
          ) : null}{' '}
          e in una cache locale (IndexedDB) su questo dispositivo. I PDF vengono letti direttamente nel browser: nessun server
          intermedio. Il token resta nel localStorage di questo dispositivo e non viene mai inserito nel codice dell’app.
        </p>
      </div>
    </div>
  );
}
