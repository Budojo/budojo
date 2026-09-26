import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  dataLayout,
  generateSecrets,
  parseSecrets,
  planMigration,
  planRecovery,
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
    expect(layout.themeFile).toBe(path.resolve('/data/Budojo/theme.json'));
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

/**
 * A restore swaps the database by renames (#1909): the live files step aside
 * as `.previous`, the staged `.restoring` copies are renamed in. A crash
 * between two of those renames used to leave no `budojo.sqlite` at all, and
 * the next boot ran first-run setup on an empty one while the owner's data
 * sat unnoticed beside it (#1919). The plan puts the swap back together
 * before anything else looks at the files.
 */
describe('planRecovery (#1919)', () => {
  const layout = dataLayout('/data/Budojo');
  const db = layout.databasePath;
  const storage = layout.storageDir;
  const on =
    (...present: string[]) =>
    (candidate: string): boolean =>
      present.includes(candidate);

  it('does nothing on an ordinary boot', () => {
    expect(planRecovery(layout, on(db, `${db}-wal`, storage))).toEqual({ situation: 'none', steps: [] });
  });

  it('does nothing on a first run', () => {
    expect(planRecovery(layout, on()).steps).toEqual([]);
  });

  it('puts the database back when the crash came between the two renames', () => {
    const plan = planRecovery(layout, on(`${db}.previous`, `${db}.restoring`, storage, `${storage}.restoring`));

    expect(plan.situation).toBe('rolled-back');
    expect(plan.steps).toEqual([
      { kind: 'rename', from: `${db}.previous`, to: db },
      // The restore never finished, and the archive it came from is still
      // there: its staged copies are only in the way of the next one.
      { kind: 'remove', path: `${db}.restoring` },
      { kind: 'remove', path: `${storage}.restoring` },
    ]);
  });

  it('brings back the -wal and -shm that stepped aside with it', () => {
    const plan = planRecovery(layout, on(`${db}.previous`, `${db}.previous-wal`, `${db}.previous-shm`, storage));

    expect(plan.steps).toEqual([
      { kind: 'rename', from: `${db}.previous`, to: db },
      { kind: 'rename', from: `${db}.previous-wal`, to: `${db}-wal` },
      { kind: 'rename', from: `${db}.previous-shm`, to: `${db}-shm` },
    ]);
  });

  it('leaves a sibling that had not moved yet where it is', () => {
    // The main file went first; the crash came before its -wal followed.
    const plan = planRecovery(layout, on(`${db}.previous`, `${db}-wal`, storage));

    expect(plan.steps).toEqual([{ kind: 'rename', from: `${db}.previous`, to: db }]);
  });

  it('never renames over a file that is already there', () => {
    const plan = planRecovery(layout, on(`${db}.previous`, `${db}.previous-wal`, `${db}-wal`, storage));

    expect(plan.steps).toEqual([{ kind: 'rename', from: `${db}.previous`, to: db }]);
  });

  it('brings storage back too, when it had stepped aside', () => {
    const plan = planRecovery(layout, on(`${db}.previous`, `${storage}.previous`));

    expect(plan.steps).toEqual([
      { kind: 'rename', from: `${db}.previous`, to: db },
      { kind: 'rename', from: `${storage}.previous`, to: storage },
    ]);
  });

  it('never acts on a leftover .previous while the database is there', () => {
    // What a finished restore could not tidy away: the next restore sets it
    // aside as `.kept-*`. It is not a crash.
    expect(planRecovery(layout, on(db, `${db}.previous`, storage)).steps).toEqual([]);
  });

  it('finishes the swap when the database was already in and storage was not', () => {
    // Crash after `storage` stepped aside, before the restored one came in:
    // the restored database with no documents at all.
    const plan = planRecovery(layout, on(db, `${db}.previous`, `${storage}.previous`, `${storage}.restoring`));

    expect(plan.situation).toBe('rolled-forward');
    expect(plan.steps).toEqual([{ kind: 'rename', from: `${storage}.restoring`, to: storage }]);
  });

  it('finishes the swap when the database was in and storage had not moved yet', () => {
    const plan = planRecovery(layout, on(db, `${db}.previous`, storage, `${storage}.restoring`));

    expect(plan.situation).toBe('rolled-forward');
    expect(plan.steps).toEqual([
      { kind: 'rename', from: storage, to: `${storage}.previous` },
      { kind: 'rename', from: `${storage}.restoring`, to: storage },
    ]);
  });

  it('never rolls a copy forward that the crash may have cut short', () => {
    // `.restoring` still beside the database means the renames never began:
    // the crash came while copying, and the staged storage may be partial.
    expect(planRecovery(layout, on(db, `${db}.previous`, `${db}.restoring`, `${storage}.restoring`)).steps).toEqual(
      [],
    );
  });

  it('does not guess when both storages are already taken', () => {
    expect(
      planRecovery(layout, on(db, `${db}.previous`, storage, `${storage}.previous`, `${storage}.restoring`)).steps,
    ).toEqual([]);
  });

  describe('invariants, over every combination of files', () => {
    const siblings = ['', '-wal', '-shm', '-journal'];
    const candidates = [
      ...siblings.map((sibling) => db + sibling),
      ...siblings.map((sibling) => `${db}.previous${sibling}`),
      `${db}.restoring`,
      storage,
      `${storage}.previous`,
      `${storage}.restoring`,
    ];
    const states = Array.from({ length: 2 ** candidates.length }, (_, mask) =>
      candidates.filter((_, bit) => ((mask >> bit) & 1) === 1),
    );

    /** The files left once a plan has run, or a failure naming the step that could not. */
    const apply = (present: string[]): Set<string> => {
      const files = new Set(present);
      for (const step of planRecovery(layout, on(...present)).steps) {
        if (step.kind === 'rename') {
          expect(files.has(step.from), `rename from a missing ${step.from}`).toBe(true);
          expect(files.has(step.to), `rename onto a taken ${step.to}`).toBe(false);
          files.delete(step.from);
          files.add(step.to);
        } else {
          files.delete(step.path);
        }
      }
      return files;
    };

    it('only ever removes a staged .restoring copy', () => {
      for (const present of states) {
        for (const step of planRecovery(layout, on(...present)).steps) {
          if (step.kind === 'remove') expect(step.path.endsWith('.restoring')).toBe(true);
        }
      }
    });

    it('never renames onto a path that is taken, nor from one that is not there', () => {
      for (const present of states) apply(present);
    });

    it('leaves a database behind whenever there was one to recover', () => {
      for (const present of states) {
        if (!present.includes(db) && !present.includes(`${db}.previous`)) continue;
        expect(apply(present).has(db)).toBe(true);
      }
    });

    it('never touches a database that is there and was not part of an interrupted swap', () => {
      for (const present of states) {
        if (!present.includes(db)) continue;
        for (const step of planRecovery(layout, on(...present)).steps) {
          const touched = step.kind === 'rename' ? [step.from, step.to] : [step.path];
          expect(touched.some((file) => file.startsWith(db))).toBe(false);
        }
      }
    });
  });
});
