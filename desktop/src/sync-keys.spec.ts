import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { generateSecrets } from './bootstrap.js';
import { holdsTheseSecrets, newAcademyKeys, parseAcademyKeys } from './sync-keys.js';

/** The academy's keys on the owner's Google account (#2033): what the PC writes, and the shape a phone reads. */
describe('the academy keys', () => {
  const secrets = generateSecrets();
  const now = new Date('2026-10-02T18:00:00.000Z');

  it('carry this PC\'s two keys, a new sync key and a new folder id', () => {
    const keys = newAcademyKeys(secrets, now);

    expect(keys).toMatchObject({ v: 1, APP_KEY: secrets.APP_KEY, DOCUMENT_ENCRYPTION_KEY: secrets.DOCUMENT_ENCRYPTION_KEY });
    expect(keys.folder).toMatch(/^[0-9a-f]{32}$/);
    expect(Buffer.from(keys.syncKey, 'base64')).toHaveLength(32);
    expect(keys.createdAt).toBe('2026-10-02T18:00:00.000Z');
  });

  it('read back as written', () => {
    const keys = newAcademyKeys(secrets, now);

    expect(parseAcademyKeys(JSON.stringify(keys))).toEqual(keys);
  });

  it('refuse a file that is not whole: never half a key', () => {
    const keys = newAcademyKeys(secrets, now);

    expect(() => parseAcademyKeys('not json')).toThrow();
    expect(() => parseAcademyKeys(JSON.stringify({ ...keys, v: 2 }))).toThrow();
    expect(() => parseAcademyKeys(JSON.stringify({ ...keys, folder: 'x' }))).toThrow();
    expect(() => parseAcademyKeys(JSON.stringify({ ...keys, syncKey: 'c2hvcnQ=' }))).toThrow();
    expect(() => parseAcademyKeys(JSON.stringify({ ...keys, APP_KEY: 'no-prefix' }))).toThrow();
  });

  it('say whether they open what this PC encrypted', () => {
    const keys = newAcademyKeys(secrets, now);

    expect(holdsTheseSecrets(keys, secrets)).toBe(true);
    expect(holdsTheseSecrets(keys, generateSecrets())).toBe(false);
  });
});

/**
 * The vectors both readers run (#2033): the client's `keys.spec.ts` reads the
 * same file, so a check one side makes and the other does not fails here or
 * there.
 */
describe('the shared keys vectors', () => {
  const vectors = JSON.parse(
    readFileSync(new URL('../../client/src/app/core/sync/vectors/keys-vectors.json', import.meta.url), 'utf8'),
  ) as { valid: unknown[]; invalid: { why: string; keys: unknown }[] };

  it.each(vectors.valid.map((keys, i) => [i, keys] as const))('reads valid file %i', (_i, keys) => {
    expect(() => parseAcademyKeys(JSON.stringify(keys))).not.toThrow();
  });

  it.each(vectors.invalid.map(({ why, keys }) => [why, keys] as const))('refuses %s', (_why, keys) => {
    expect(() => parseAcademyKeys(JSON.stringify(keys))).toThrow();
  });
});

