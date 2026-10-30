import type { Connection } from './connection';
import { base64ToUtf8, utf8ToBase64 } from './base64';

/**
 * Link di accesso in sola consultazione: https://…/utenze-app/#invito=<dati>
 *
 * I dati (owner, repository e un token Contents: Read-only) stanno dopo il "#": i browser non inviano mai
 * questa parte ai server, quindi non finisce nei log di GitHub Pages. All'apertura l'app salva la connessione
 * sul dispositivo e toglie subito il frammento dalla barra degli indirizzi e dalla cronologia.
 *
 * Il link NON è cifrato: chi lo possiede vede i dati finché il token non viene eliminato su GitHub.
 */

const PREFIX = '#invito=';

interface InvitePayload {
  v: 1;
  o: string;
  r: string;
  t: string;
}

const toBase64Url = (s: string) => utf8ToBase64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) => base64ToUtf8(s.replace(/-/g, '+').replace(/_/g, '/'));

export function createInviteLink(appUrl: string, c: Pick<Connection, 'owner' | 'repo' | 'token'>): string {
  const payload: InvitePayload = { v: 1, o: c.owner, r: c.repo, t: c.token };
  return `${appUrl.split('#')[0]}${PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

/** Legge un link di accesso dal frammento dell'URL. Restituisce null se non c'è o non è valido. */
export function parseInviteHash(hash: string): Connection | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const p = JSON.parse(fromBase64Url(hash.slice(PREFIX.length))) as Partial<InvitePayload>;
    const valid = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0 && x.length < 300;
    if (p.v !== 1 || !valid(p.o) || !valid(p.r) || !valid(p.t)) return null;
    return { owner: p.o.trim(), repo: p.r.trim(), token: p.t.trim(), readOnly: true };
  } catch {
    return null;
  }
}

export function isInviteHash(hash: string): boolean {
  return hash.startsWith(PREFIX);
}

/** Rimuove il link di accesso dall'indirizzo, senza lasciare una voce in cronologia con il token. */
export function clearInviteFromUrl(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
