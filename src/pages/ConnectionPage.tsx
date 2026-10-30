import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Github, KeyRound, Loader2, ShieldAlert, XCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/Field';
import { PrivacyNote } from '@/components/PrivacyNote';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GitHubStore, type VerifyResult } from '@/lib/storage/github';
import type { Connection } from '@/lib/storage/connection';

export function ConnectionPage({ onConnect }: { onConnect: (c: Connection) => void }) {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('utenze-data');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const conn = (): Connection => ({ owner: owner.trim(), repo: repo.trim(), token: token.trim() });
  const valid = owner.trim() && repo.trim() && token.trim();

  async function verify() {
    if (!valid) return;
    setChecking(true);
    setResult(null);
    try {
      const r = await new GitHubStore(conn()).verify();
      setResult(r);
      if (r.ok) toast.success('Connessione verificata');
    } catch (e) {
      setResult({
        ok: false,
        isPrivate: false,
        canWrite: false,
        defaultBranch: '',
        hasDatabase: false,
        message: e instanceof Error ? e.message : 'Errore di rete.',
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background bg-app-gradient px-4 py-8 sm:py-16">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-cyan-500 text-white shadow-lift">
            <Zap className="size-6" fill="currentColor" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Connetti il repository dati</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            I dati vengono salvati in un repository GitHub <strong>privato</strong> separato dal codice, così puoi usarli su PC e
            smartphone.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="size-4" aria-hidden /> Connessione
            </CardTitle>
            <CardDescription>Usa un Fine-grained Personal Access Token con permesso Contents: Read and write solo sul repo dati.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (result?.ok) onConnect(conn());
                else void verify();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="owner" label="Owner (utente o organizzazione)">
                  <Input
                    id="owner"
                    value={owner}
                    onChange={(e) => {
                      setOwner(e.target.value);
                      setResult(null);
                    }}
                    placeholder="es. mario-rossi"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </Field>
                <Field id="repo" label="Nome del repository dati">
                  <Input
                    id="repo"
                    value={repo}
                    onChange={(e) => {
                      setRepo(e.target.value);
                      setResult(null);
                    }}
                    placeholder="utenze-data"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </Field>
              </div>
              <Field
                id="token"
                label="Fine-grained Personal Access Token"
                hint={
                  <a
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                  >
                    Crea un token su GitHub <ExternalLink className="size-3" aria-hidden />
                  </a>
                }
              >
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="token"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setResult(null);
                    }}
                    placeholder="github_pat_…"
                    className="pl-9 pr-10 font-mono"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showToken ? 'Nascondi token' : 'Mostra token'}
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {result && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={
                    result.ok && result.isPrivate
                      ? 'flex gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-300'
                      : result.ok
                        ? 'flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300'
                        : 'flex gap-2 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300'
                  }
                  role="status"
                  aria-live="polite"
                >
                  {result.ok && result.isPrivate ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : result.ok ? (
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>{result.message}</span>
                </motion.div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="flex-1" onClick={() => void verify()} disabled={!valid || checking}>
                  {checking ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Verifica connessione
                </Button>
                <Button type="submit" className="flex-1" disabled={!result?.ok}>
                  Connetti e sincronizza
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <PrivacyNote className="mt-6" />
      </motion.div>
    </div>
  );
}
