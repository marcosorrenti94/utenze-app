import { useState } from 'react';
import { Copy, ExternalLink, KeyRound, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from './Field';
import { GitHubStore } from '@/lib/storage/github';
import { createInviteLink } from '@/lib/storage/invite';
import { useData } from '@/state/DataContext';

/**
 * Genera un link di accesso in sola consultazione per un'altra persona.
 * Il token in sola lettura non viene salvato qui: finisce solo dentro il link.
 */
export function ShareAccessCard() {
  const { connection } = useData();
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function generate() {
    const t = token.trim();
    if (!t) return;
    if (t === connection.token) {
      toast.error('Questo è il tuo token con permesso di scrittura', {
        description: 'Crea un token separato con Contents: Read-only, così l’altra persona non può modificare nulla.',
      });
      return;
    }
    setChecking(true);
    setLink(null);
    try {
      const conn = { owner: connection.owner, repo: connection.repo, token: t, readOnly: true };
      const r = await new GitHubStore(conn).verify();
      if (!r.ok) {
        toast.error('Token non utilizzabile', { description: r.message });
        return;
      }
      setLink(createInviteLink(window.location.href, conn));
      setToken('');
    } catch (e) {
      toast.error('Verifica non riuscita', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setChecking(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiato', { description: 'Invialo alla persona che deve consultare i dati.' });
    } catch {
      toast.error('Copia non riuscita', { description: 'Seleziona il link e copialo a mano.' });
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" aria-hidden /> Condividi in sola consultazione
        </CardTitle>
        <CardDescription>
          Crea un link: chi lo apre vede dashboard, letture, bollette e riepiloghi senza token né account GitHub, e senza poter
          modificare nulla.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
            >
              Crea un nuovo token <ExternalLink className="size-3" aria-hidden />
            </a>{' '}
            solo per <code className="rounded bg-muted px-1 text-xs">{connection.repo}</code> con <strong>Contents: Read-only</strong> e una
            scadenza.
          </li>
          <li>Incollalo qui sotto e premi «Crea link».</li>
          <li>Invia il link alla persona. Per revocare l’accesso, elimina quel token su GitHub.</li>
        </ol>

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <Field id="share-token" label="Token in sola lettura" className="flex-1">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="share-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                className="pl-9 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </Field>
          <Button type="submit" disabled={!token.trim() || checking}>
            {checking ? <Loader2 className="animate-spin" /> : <Link2 />}
            Crea link
          </Button>
        </form>

        {link && (
          <div className="space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Link pronto</p>
            <div className="flex gap-2">
              <Input value={link} readOnly aria-label="Link di accesso" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copy()}>
                <Copy /> Copia
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Chi ha questo link vede tutti i dati, PDF compresi. Mandalo solo alla persona interessata e non pubblicarlo.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
