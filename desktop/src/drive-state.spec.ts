import { describe, expect, it } from 'vitest';

import {
  describeSyncError,
  emptyState,
  parseState,
  recordFailure,
  recordSuccess,
  serialiseState,
  unlinkedState,
} from './drive-state.js';

/**
 * The link's state as the user sees it (#1301): connected or not, when the last
 * upload worked, and what went wrong if it didn't.
 *
 * Failures are deliberately silent — no notification, no dialog — because the
 * LOCAL backup already succeeded, so a failed upload is never urgent. The whole
 * cost of that choice lands here: if this state is not honest and legible, a
 * link that has been broken for three weeks looks exactly like one that works.
 */

const now = 1_700_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('parseState', () => {
  it('treats a missing file as not linked, rather than guessing', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(emptyState().linked).toBe(false);
  });

  it('treats unreadable JSON as not linked instead of throwing', () => {
    // A corrupt state file must not stop the app booting. Worst case the owner
    // reconnects; losing the boot would lose everything else too.
    expect(parseState('{ not json')).toEqual(emptyState());
  });

  it('ignores a state file from a newer version', () => {
    expect(parseState(JSON.stringify({ v: 99, linked: true, account: 'x' }))).toEqual(emptyState());
  });

  it('round-trips through serialise', () => {
    const state = recordSuccess(
      { ...emptyState(), linked: true, account: 'gym@example.it', folderId: 'folder-1' },
      { at: now, uploaded: 2 },
    );

    expect(parseState(serialiseState(state))).toEqual(state);
  });

  it('drops a linked flag that carries no account — half a link is not a link', () => {
    const parsed = parseState(JSON.stringify({ v: 1, linked: true }));

    expect(parsed.linked).toBe(false);
  });
});

describe('recordSuccess', () => {
  it('stamps the time and clears any previous error', () => {
    const failed = recordFailure({ ...emptyState(), linked: true, account: 'a' }, {
      at: now - 60_000,
      error: 'network',
    });

    const ok = recordSuccess(failed, { at: now, uploaded: 1 });

    expect(ok.lastSyncAt).toBe(iso(now));
    expect(ok.lastError).toBeNull();
    expect(ok.consecutiveFailures).toBe(0);
  });

  // "Nothing to upload" is a healthy sync, not a no-op to hide: it is what a
  // correctly-working link looks like most of the time.
  it('counts a sync that uploaded nothing as a success', () => {
    const ok = recordSuccess({ ...emptyState(), linked: true, account: 'a' }, { at: now, uploaded: 0 });

    expect(ok.lastSyncAt).toBe(iso(now));
    expect(ok.lastError).toBeNull();
  });
});

describe('recordFailure', () => {
  it('keeps the last SUCCESS time while recording the error', () => {
    // The two facts answer different questions: "is it working now?" and "how
    // old is the newest copy up there?". Overwriting the success time with the
    // failure time would erase the second, which is the one that matters.
    const ok = recordSuccess({ ...emptyState(), linked: true, account: 'a' }, { at: now - 3_600_000, uploaded: 1 });
    const failed = recordFailure(ok, { at: now, error: 'quota' });

    expect(failed.lastSyncAt).toBe(iso(now - 3_600_000));
    expect(failed.lastError).toBe('quota');
    expect(failed.lastErrorAt).toBe(iso(now));
  });

  it('counts consecutive failures', () => {
    let state = { ...emptyState(), linked: true, account: 'a' };
    state = recordFailure(state, { at: now, error: 'network' });
    state = recordFailure(state, { at: now + 1, error: 'network' });

    expect(state.consecutiveFailures).toBe(2);
  });
});

describe('unlinkedState', () => {
  it('forgets the account and the folder, not just the flag', () => {
    const linked = recordSuccess(
      { ...emptyState(), linked: true, account: 'gym@example.it', folderId: 'folder-1' },
      { at: now, uploaded: 1 },
    );

    const gone = unlinkedState();

    expect(gone.linked).toBe(false);
    expect(gone.account).toBeNull();
    expect(gone.folderId).toBeNull();
    expect(gone.lastSyncAt).toBeNull();
    // Disconnecting must leave nothing that identifies the account behind.
    expect(JSON.stringify(gone)).not.toContain('gym@example.it');
    expect(JSON.stringify(gone)).not.toContain(linked.folderId as string);
  });
});

describe('describeSyncError', () => {
  // The user reads this, so it says what to do, not what the API returned.
  it.each([
    ['invalid_grant', /reconnect/i],
    ['storageQuotaExceeded', /space/i],
    ['network', /connection/i],
  ])('turns %s into something actionable', (code, expected) => {
    expect(describeSyncError(code)).toMatch(expected);
  });

  it('falls back to the raw code rather than swallowing an unknown failure', () => {
    expect(describeSyncError('teapot')).toContain('teapot');
  });
});
