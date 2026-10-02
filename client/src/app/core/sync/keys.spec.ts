import { describe, expect, it } from 'vitest';
import { parseAcademyKeys } from './keys';
import vectors from './vectors/keys-vectors.json';

/**
 * The academy's keys as the PC writes them to the Google account (#2033), and
 * as the phone reads them. The fixture has the PC writer's shape
 * (`desktop/src/sync-keys.ts`, `newAcademyKeys`): a change on either side
 * fails here or there.
 */
describe('the academy keys on the Google account (#2033)', () => {
  const written = {
    v: 1,
    folder: '0123456789abcdef0123456789abcdef',
    syncKey: btoa('k'.repeat(32)),
    APP_KEY: `base64:${btoa('a'.repeat(32))}`,
    DOCUMENT_ENCRYPTION_KEY: btoa('d'.repeat(32)),
    createdAt: '2026-10-02T18:00:00.000Z',
  };

  it('reads what the PC writes', () => {
    const parsed = parseAcademyKeys(JSON.parse(JSON.stringify(written)));

    expect(parsed).toEqual({
      ok: true,
      value: {
        folder: written.folder,
        syncKey: written.syncKey,
        APP_KEY: written.APP_KEY,
        DOCUMENT_ENCRYPTION_KEY: written.DOCUMENT_ENCRYPTION_KEY,
        createdAt: written.createdAt,
      },
    });
  });

  it.each([
    ['another version', { v: 2 }],
    ['no folder id', { folder: 'x' }],
    ['a short sync key', { syncKey: btoa('short') }],
    ['a sync key that is not base64', { syncKey: '***' }],
    ['an APP_KEY without its prefix', { APP_KEY: btoa('a'.repeat(32)) }],
    ['a short document key', { DOCUMENT_ENCRYPTION_KEY: 'short' }],
    ['no time', { createdAt: 'yesterday' }],
  ])('refuses %s: never half a key set', (_case, change) => {
    expect(parseAcademyKeys({ ...written, ...change }).ok).toBe(false);
  });

  it('refuses what is not an object', () => {
    expect(parseAcademyKeys('keys').ok).toBe(false);
  });
});

/** The vectors the PC's writer runs too (`desktop/src/sync-keys.spec.ts`). */
describe('the shared keys vectors (#2033)', () => {
  it.each(vectors.valid.map((keys, i) => [i, keys] as const))('reads valid file %i', (_i, keys) => {
    expect(parseAcademyKeys(keys).ok).toBe(true);
  });

  it.each(vectors.invalid.map(({ why, keys }) => [why, keys] as const))(
    'refuses %s',
    (_why, keys) => {
      expect(parseAcademyKeys(keys).ok).toBe(false);
    },
  );
});
