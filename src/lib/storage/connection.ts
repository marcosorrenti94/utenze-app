/** Configurazione della connessione al repo dati privato, salvata SOLO nel localStorage del dispositivo. */
export interface Connection {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
  /**
   * Solo consultazione: l'app non scrive mai sul repository e nasconde le modifiche.
   * Va usato con un token "Contents: Read-only", che è la vera protezione lato GitHub.
   */
  readOnly?: boolean;
}

const KEY = 'utenze.connection.v1';

export function loadConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Connection;
    if (!c.owner || !c.repo || !c.token) return null;
    return c;
  } catch {
    return null;
  }
}

export function saveConnection(c: Connection): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function clearConnection(): void {
  localStorage.removeItem(KEY);
}

export function connectionKey(c: Pick<Connection, 'owner' | 'repo'>): string {
  return `${c.owner.toLowerCase()}/${c.repo.toLowerCase()}`;
}
