import { parseJournalEntry } from './journal';

/**
 * The entry the server's journal records (#2031): this is the contract the
 * two sides share, so the client must take the server's shape as it is.
 */
describe('a journal entry as the server records it (#2031)', () => {
  const entry = {
    id: '01K6F3Q8Z4M7X2N5P9R1T3V6W8',
    device: 'pc4f2a',
    at: '2026-10-01T18:32:05.123456Z',
    method: 'POST',
    route: 'athletes.photo.upload',
    params: { athlete: 57 },
    body: { photo: { $file: { sha256: 'a'.repeat(64), name: 'p.png', type: 'image/png' } } },
    created: {},
    before: { athletes: { '57': { photo_path: null, photo_sha256: null } } },
  };

  it('is accepted whole: microseconds, a kept upload, what the rows held by table and id', () => {
    const parsed = parseJournalEntry(entry);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.before).toEqual(entry.before);
  });

  it('takes a write with no route parameters and no rows created', () => {
    expect(parseJournalEntry({ ...entry, params: {}, created: {}, before: null }).ok).toBe(true);
  });

  it('takes the ids an athlete creation records, the first belt among them', () => {
    const created = { athletes: [57], athlete_promotions: [12], audit_entries: [3] };

    expect(parseJournalEntry({ ...entry, route: 'athletes.store', params: {}, created }).ok).toBe(
      true,
    );
  });
});
