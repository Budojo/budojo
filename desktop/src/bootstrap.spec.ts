import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  dataLayout,
  generateSecrets,
  parseSecrets,
  planMigration,
  serializeSecrets,
  snapshotFileName,
  storageSubdirs,
} from './bootstrap.js';

/**
 * Pure parts of the first-run bootstrap (#1223). The runner that creates
 * directories, encrypts secrets and runs artisan is exercised against the real
 * runtime in a harness; the decisions it makes are pinned here.
 */

describe('dataLayout', () => {
  const layout = dataLayout('/data/Budojo');

  it('keeps everything under one root', () => {
    for (const value of Object.values(layout)) {
      expect(value.startsWith(path.resolve('/data/Budojo'))).toBe(true);
    }
  });

  it('names the files the rest of the desktop package relies on', () => {
    expect(layout.databasePath).toBe(path.resolve('/data/Budojo/budojo.sqlite'));
    expect(layout.secretsFile).toBe(path.resolve('/data/Budojo/secrets.bin'));
    expect(layout.stateFile).toBe(path.resolve('/data/Budojo/bootstrap.json'));
    expect(layout.storageDir).toBe(path.resolve('/data/Budojo/storage'));
    expect(layout.backupsDir).toBe(path.resolve('/data/Budojo/backups'));
  });

  // The Google refresh token must not travel inside a backup archive (#1301).
  // The archive is the database plus `storage/`, so anything at the root of
  // userData is outside it — this pins that the token file stays there, beside
  // secrets.bin, rather than drifting into storage/ where it would be uploaded
  // to the very account it grants access to.
  it('keeps the drive token outside storage/, so a backup can never carry it', () => {
    expect(layout.driveTokenFile).toBe(path.resolve('/data/Budojo/drive-token.bin'));
    expect(layout.driveTokenFile.startsWith(layout.storageDir)).toBe(false);
    expect(layout.driveStateFile.startsWith(layout.storageDir)).toBe(false);
  });
});

describe('storageSubdirs', () => {
  it('creates the framework subtree Laravel writes to but never creates', () => {
    const dirs = storageSubdirs('/s');

    for (const expected of ['framework/cache/data', 'framework/sessions', 'framework/views', 'logs', 'app']) {
      expect(dirs).toContain(path.join('/s', ...expected.split('/')));
    }
  });
});

describe('secrets', () => {
  // Deterministic bytes so the shape is testable; production uses crypto.randomBytes.
  const fakeRandom = (n: number): Buffer => Buffer.alloc(n, 7);

  it('generates two independent 32-byte keys in the formats Laravel expects', () => {
    const secrets = generateSecrets(fakeRandom);

    expect(secrets.APP_KEY.startsWith('base64:')).toBe(true);
    expect(Buffer.from(secrets.APP_KEY.slice('base64:'.length), 'base64')).toHaveLength(32);
    // config/documents.php reads the raw base64 — no prefix.
    expect(secrets.DOCUMENT_ENCRYPTION_KEY.startsWith('base64:')).toBe(false);
    expect(Buffer.from(secrets.DOCUMENT_ENCRYPTION_KEY, 'base64')).toHaveLength(32);
  });

  it('round-trips through serialisation', () => {
    const secrets = generateSecrets();

    expect(parseSecrets(serializeSecrets(secrets))).toEqual(secrets);
  });

  it('refuses a truncated or foreign file rather than yielding empty keys', () => {
    // A half-written secrets file that parsed to empty strings would let the
    // app boot with a blank APP_KEY — every token and encrypted column broken,
    // no error anywhere. Loud failure is the only acceptable outcome.
    expect(() => parseSecrets('')).toThrow(/not valid JSON/);
    expect(() => parseSecrets('{"v":1}')).toThrow(/APP_KEY/);
    expect(() => parseSecrets('{"v":1,"APP_KEY":"base64:short","DOCUMENT_ENCRYPTION_KEY":"x"}')).toThrow(/APP_KEY/);
    expect(() => parseSecrets('{"v":2,"APP_KEY":"base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","DOCUMENT_ENCRYPTION_KEY":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}')).toThrow(/version 2/);
  });
});

describe('planMigration', () => {
  it('migrates an empty database without a snapshot — there is nothing to protect', () => {
    expect(planMigration({ databaseBytes: 0, pendingExitCode: null })).toEqual({ migrate: true, snapshot: false });
  });

  it('does nothing when the schema is current', () => {
    // The everyday launch: fast path, no artisan migrate, no backup churn.
    expect(planMigration({ databaseBytes: 4096, pendingExitCode: 0 })).toEqual({ migrate: false, snapshot: false });
  });

  it('snapshots before migrating a database that has data', () => {
    // The upgrade path. An interrupted migration must never be the reason a
    // year of attendance is gone — the snapshot exists before anything runs.
    expect(planMigration({ databaseBytes: 4096, pendingExitCode: 1 })).toEqual({ migrate: true, snapshot: true });
  });

  it('treats an unknown status result as "migrate, but protect first"', () => {
    // A non-empty file with no migrations table (or a status command that
    // failed for any other reason) gets the cautious branch, not the fast one.
    expect(planMigration({ databaseBytes: 4096, pendingExitCode: 2 })).toEqual({ migrate: true, snapshot: true });
    expect(planMigration({ databaseBytes: 4096, pendingExitCode: null })).toEqual({ migrate: true, snapshot: true });
  });
});

describe('snapshotFileName', () => {
  it('is sortable and unambiguous', () => {
    expect(snapshotFileName(new Date(2026, 7, 15, 9, 5, 3))).toBe('pre-migration-20260815-090503.sqlite');
  });
});
