/**
 * The Drive link's state as the user sees it (#1301): connected or not, when
 * the last upload worked, and what went wrong if it didn't.
 *
 * Pure — the caller owns reading and writing the file. `drive-io.ts` does that.
 *
 * Failures here are deliberately **silent**: no notification, no dialog. The
 * local backup already succeeded, so a failed upload is never urgent. The
 * entire cost of that choice lands on this module — if the state is not honest
 * and legible in the Backup page, a link that has been broken for three weeks
 * looks exactly like one that works.
 *
 * The state file holds no secret. The refresh token lives in the OS keychain
 * through `safeStorage`, the same as `secrets.bin` and the sign-in token
 * (#1223, #1227); this file only records what happened.
 */

/** Bumped only on a breaking shape change; an unknown version resets to unlinked. */
const STATE_VERSION = 1;

export interface DriveState {
  v: number;
  linked: boolean;
  /** The Google account the archives go to, for display. */
  account: string | null;
  /** The Drive folder id, cached so every sync does not re-resolve it. */
  folderId: string | null;
  /** ISO time of the last sync that COMPLETED, successful upload or nothing to do. */
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
}

export function emptyState(): DriveState {
  return {
    v: STATE_VERSION,
    linked: false,
    account: null,
    folderId: null,
    lastSyncAt: null,
    lastError: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
  };
}

/** Disconnecting forgets the account and folder, not just the flag. */
export function unlinkedState(): DriveState {
  return emptyState();
}

/**
 * Never throws. A corrupt state file must not stop the app booting — the worst
 * outcome of resetting is that the owner reconnects, while a failed boot loses
 * everything else too.
 */
export function parseState(raw: string | null): DriveState {
  if (raw === null) {
    return emptyState();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return emptyState();
  }

  const candidate = parsed as Partial<DriveState>;
  if (candidate.v !== STATE_VERSION) {
    return emptyState();
  }

  const account = typeof candidate.account === 'string' ? candidate.account : null;

  return {
    v: STATE_VERSION,
    // Half a link is not a link: a `linked` flag with no account cannot be
    // acted on and would show a connected UI that can do nothing.
    linked: candidate.linked === true && account !== null,
    account,
    folderId: typeof candidate.folderId === 'string' ? candidate.folderId : null,
    lastSyncAt: typeof candidate.lastSyncAt === 'string' ? candidate.lastSyncAt : null,
    lastError: typeof candidate.lastError === 'string' ? candidate.lastError : null,
    lastErrorAt: typeof candidate.lastErrorAt === 'string' ? candidate.lastErrorAt : null,
    consecutiveFailures:
      typeof candidate.consecutiveFailures === 'number' && Number.isFinite(candidate.consecutiveFailures)
        ? candidate.consecutiveFailures
        : 0,
  };
}

export function serialiseState(state: DriveState): string {
  return JSON.stringify(state, null, 2);
}

export function recordSuccess(state: DriveState, input: { at: number; uploaded: number }): DriveState {
  return {
    ...state,
    lastSyncAt: new Date(input.at).toISOString(),
    lastError: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
  };
}

/**
 * Keeps `lastSyncAt` untouched. The two timestamps answer different questions —
 * "is it working now?" and "how old is the newest copy up there?" — and the
 * second is the one that matters when the disk dies.
 */
export function recordFailure(state: DriveState, input: { at: number; error: string }): DriveState {
  return {
    ...state,
    lastError: input.error,
    lastErrorAt: new Date(input.at).toISOString(),
    consecutiveFailures: state.consecutiveFailures + 1,
  };
}

/**
 * What the Backup page shows. Says what to do about it, not what the API
 * returned — the reader is a jiu-jitsu instructor, not the person who wrote
 * the OAuth client.
 */
export function describeSyncError(code: string): string {
  switch (code) {
    case 'invalid_grant':
    case 'unauthorized':
      return 'Google revoked the connection. Reconnect the account to resume backups.';
    case 'storageQuotaExceeded':
      return 'This Google account is out of space. Free some up, or connect a different account.';
    case 'network':
      return 'No connection to Google. Backups are still being saved on this computer.';
    default:
      // Never swallow an unknown failure into a vague message: the raw code is
      // the only thread back to the cause.
      return `Upload failed (${code}). Backups are still being saved on this computer.`;
  }
}
