import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDatabase } from '@/lib/calc/defaults';
import { GitHubStore, ReadOnlyError } from './github';

describe('GitHubStore in solo consultazione', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rifiuta ogni scrittura senza contattare GitHub', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const store = new GitHubStore({ owner: 'o', repo: 'r', token: 't', readOnly: true });

    await expect(store.writeDatabase(emptyDatabase(), 'sha')).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(store.putFile('bills/x.pdf', new ArrayBuffer(1), 'm')).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(store.deleteFile('bills/x.pdf', 'm')).rejects.toBeInstanceOf(ReadOnlyError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
