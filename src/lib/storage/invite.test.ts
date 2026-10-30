import { describe, expect, it } from 'vitest';
import { createInviteLink, isInviteHash, parseInviteHash } from './invite';

describe('link di accesso in sola consultazione', () => {
  const conn = { owner: 'utente', repo: 'utenze-data', token: 'github_pat_ABC123_xyz' };

  it('andata e ritorno: il link apre la connessione in sola consultazione', () => {
    const link = createInviteLink('https://utente.github.io/utenze-app/#/riepilogo', conn);
    expect(link.startsWith('https://utente.github.io/utenze-app/#invito=')).toBe(true);
    // Il token va solo nel frammento (#), mai nel percorso o nella query
    expect(link.split('#')[0]).not.toContain('github_pat');
    const hash = link.slice(link.indexOf('#'));
    expect(isInviteHash(hash)).toBe(true);
    expect(parseInviteHash(hash)).toEqual({ ...conn, readOnly: true });
  });

  it('il frammento è sicuro negli URL (niente + / =)', () => {
    const link = createInviteLink('https://x/', { owner: 'ò', repo: 'r?', token: 't>>>???' });
    expect(link.slice(link.indexOf('=') + 1)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('ignora frammenti normali e link danneggiati', () => {
    expect(parseInviteHash('#/dashboard')).toBeNull();
    expect(parseInviteHash('#invito=')).toBeNull();
    expect(parseInviteHash('#invito=%%%non-valido')).toBeNull();
    expect(parseInviteHash(`#invito=${btoa(JSON.stringify({ v: 1, o: 'a', r: 'b' }))}`)).toBeNull();
  });
});
