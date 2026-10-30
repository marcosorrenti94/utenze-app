import { Octokit } from '@octokit/rest';
import type { Database } from '@/types';
import { normalizeDatabase } from '@/lib/calc/defaults';
import { base64ToUtf8, bytesToBase64, utf8ToBase64 } from './base64';
import type { Connection } from './connection';

export const DB_PATH = 'data/db.json';

export class ConflictError extends Error {
  constructor() {
    super('Il file remoto è stato modificato da un altro dispositivo.');
    this.name = 'ConflictError';
  }
}

export class AuthError extends Error {
  constructor(message = 'Token non valido o permessi insufficienti.') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ReadOnlyError extends Error {
  constructor() {
    super('Modalità solo consultazione: le modifiche non sono consentite.');
    this.name = 'ReadOnlyError';
  }
}

export interface VerifyResult {
  ok: boolean;
  isPrivate: boolean;
  canWrite: boolean;
  defaultBranch: string;
  hasDatabase: boolean;
  message: string;
}

function status(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : undefined;
}

function wrap(err: unknown): Error {
  const s = status(err);
  if (s === 401) return new AuthError('Token non valido o scaduto: aggiorna la connessione.');
  if (s === 403) {
    return new AuthError(
      'Il token non ha i permessi necessari. Se è un token in sola lettura, ricollegati attivando «Solo consultazione».',
    );
  }
  if (s === 409) return new ConflictError();
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Accesso al repository dati privato tramite GitHub REST API (Contents API).
 * Ogni scrittura usa lo SHA dell'ultima versione letta: se nel frattempo il file
 * è cambiato, GitHub risponde 409 e viene sollevato un ConflictError.
 */
export class GitHubStore {
  private octokit: Octokit;
  private branch: string | undefined;

  constructor(private conn: Connection) {
    this.octokit = new Octokit({
      auth: conn.token,
      userAgent: 'utenze-app',
      // Evita la cache HTTP del browser: lo SHA deve essere sempre quello più recente
      request: { fetch: (url: RequestInfo | URL, init?: RequestInit) => fetch(url, { ...init, cache: 'no-store' }) },
    });
    this.branch = conn.branch;
  }

  private get repoParams() {
    return { owner: this.conn.owner, repo: this.conn.repo };
  }

  private assertWritable() {
    if (this.conn.readOnly) throw new ReadOnlyError();
  }

  async verify(): Promise<VerifyResult> {
    try {
      const { data } = await this.octokit.rest.repos.get(this.repoParams);
      this.branch = data.default_branch;
      const canWrite = Boolean(data.permissions?.push);
      let hasDatabase = false;
      try {
        await this.octokit.rest.repos.getContent({ ...this.repoParams, path: DB_PATH, ref: this.branch });
        hasDatabase = true;
      } catch (e) {
        if (status(e) !== 404) throw e;
      }
      const issues: string[] = [];
      if (!data.private) issues.push('ATTENZIONE: il repository è pubblico. Usa un repository privato per i dati.');
      if (this.conn.readOnly) {
        // In sola consultazione basta poter leggere i dati (la lettura di db.json qui sopra è già la prova)
        if (!hasDatabase) issues.push('Nel repository non ci sono ancora dati da consultare.');
        return {
          ok: hasDatabase,
          isPrivate: data.private,
          canWrite: false,
          defaultBranch: data.default_branch,
          hasDatabase,
          message: issues.length ? issues.join(' ') : 'Connessione riuscita in sola consultazione: potrai vedere i dati ma non modificarli.',
        };
      }
      if (!canWrite) issues.push('Il token non ha il permesso di scrittura (Contents: Read and write).');
      return {
        ok: canWrite,
        isPrivate: data.private,
        canWrite,
        defaultBranch: data.default_branch,
        hasDatabase,
        message: issues.length
          ? issues.join(' ')
          : hasDatabase
            ? 'Connessione riuscita. Dati esistenti trovati.'
            : 'Connessione riuscita. Il database verrà creato al primo salvataggio.',
      };
    } catch (e) {
      const s = status(e);
      if (s === 404) {
        return {
          ok: false,
          isPrivate: false,
          canWrite: false,
          defaultBranch: '',
          hasDatabase: false,
          message: 'Repository non trovato: controlla owner e nome, e che il token abbia accesso a questo repository.',
        };
      }
      if (s === 401) {
        return { ok: false, isPrivate: false, canWrite: false, defaultBranch: '', hasDatabase: false, message: 'Token non valido o scaduto.' };
      }
      throw wrap(e);
    }
  }

  /** Legge db.json. Restituisce null se il file non esiste ancora. */
  async readDatabase(): Promise<{ db: Database; sha: string } | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        ...this.repoParams,
        path: DB_PATH,
        ref: this.branch,
      });
      if (Array.isArray(data) || data.type !== 'file') throw new Error('data/db.json non è un file valido.');
      let text: string;
      if (data.content && data.encoding === 'base64') {
        text = base64ToUtf8(data.content);
      } else {
        // File > 1 MB: scarica il contenuto raw
        const blob = await this.getFile(DB_PATH);
        text = await blob.text();
      }
      return { db: normalizeDatabase(JSON.parse(text)), sha: data.sha };
    } catch (e) {
      if (status(e) === 404) return null;
      throw wrap(e);
    }
  }

  /** Scrive db.json usando lo SHA noto. Restituisce il nuovo SHA. */
  async writeDatabase(db: Database, sha: string | null): Promise<string> {
    this.assertWritable();
    try {
      const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
        ...this.repoParams,
        path: DB_PATH,
        branch: this.branch,
        message: `Aggiornamento dati ${new Date().toISOString()}`,
        content: utf8ToBase64(JSON.stringify(db, null, 2)),
        ...(sha ? { sha } : {}),
      });
      return data.content?.sha ?? '';
    } catch (e) {
      const s = status(e);
      // 409: SHA non aggiornato · 422: file creato da un altro dispositivo senza SHA
      if (s === 409 || s === 422) throw new ConflictError();
      throw wrap(e);
    }
  }

  private async currentSha(path: string): Promise<string | undefined> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({ ...this.repoParams, path, ref: this.branch });
      return !Array.isArray(data) ? data.sha : undefined;
    } catch (e) {
      if (status(e) === 404) return undefined;
      throw wrap(e);
    }
  }

  /**
   * Carica (o sostituisce) un file binario, es. bills/2026-03-luce.pdf.
   * Un 409/422 qui significa solo che il ramo o il file sono cambiati tra la lettura dello SHA e la scrittura:
   * si rilegge lo SHA e si riprova, senza segnalarlo come conflitto sui dati.
   */
  async putFile(path: string, content: ArrayBuffer, message: string): Promise<void> {
    this.assertWritable();
    const encoded = bytesToBase64(new Uint8Array(content));
    for (let attempt = 0; ; attempt++) {
      const sha = await this.currentSha(path);
      try {
        await this.octokit.rest.repos.createOrUpdateFileContents({
          ...this.repoParams,
          path,
          branch: this.branch,
          message,
          content: encoded,
          ...(sha ? { sha } : {}),
        });
        return;
      } catch (e) {
        const s = status(e);
        if ((s === 409 || s === 422) && attempt < 2) continue;
        if (s === 409 || s === 422) throw new Error(`Impossibile caricare ${path}: il repository è stato modificato durante il caricamento. Riprova.`);
        throw wrap(e);
      }
    }
  }

  /** Scarica un file binario dal repo privato (anche > 1 MB) usando il media type raw. */
  async getFile(path: string): Promise<Blob> {
    const ref = this.branch ? `?ref=${encodeURIComponent(this.branch)}` : '';
    const url = `https://api.github.com/repos/${encodeURIComponent(this.conn.owner)}/${encodeURIComponent(
      this.conn.repo,
    )}/contents/${path.split('/').map(encodeURIComponent).join('/')}${ref}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.conn.token}`,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) throw new AuthError();
    if (!res.ok) throw new Error(`Impossibile scaricare ${path} (HTTP ${res.status}).`);
    return res.blob();
  }

  async deleteFile(path: string, message: string): Promise<void> {
    this.assertWritable();
    for (let attempt = 0; ; attempt++) {
      const sha = await this.currentSha(path);
      if (!sha) return;
      try {
        await this.octokit.rest.repos.deleteFile({ ...this.repoParams, path, sha, branch: this.branch, message });
        return;
      } catch (e) {
        const s = status(e);
        if (s === 404) return;
        if ((s === 409 || s === 422) && attempt < 2) continue;
        if (s === 409 || s === 422) throw new Error(`Impossibile eliminare ${path}: il repository è stato modificato nel frattempo. Riprova.`);
        throw wrap(e);
      }
    }
  }
}
