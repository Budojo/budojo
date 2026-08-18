import { describe, expect, it, vi } from 'vitest';

import type { BackupEntry } from './backup.js';
import { DriveSyncService, type DriveSyncIO } from './drive-service.js';
import { emptyState, type DriveState } from './drive-state.js';
import type { RemoteArchive } from './drive-sync.js';

/**
 * The orchestration (#1301): link, sync, unlink. The IO is injected, so what is
 * pinned here is the ORDER things happen in and what happens when they fail —
 * which is where the damage would be.
 *
 * The rule the whole feature rests on: a sync failure must never cost the user
 * anything. The local backup already happened; the worst outcome of a bad day
 * on the network is that the cloud copy is older than it could be.
 */

const archive = (name: string, sizeBytes = 100): BackupEntry => ({
  name,
  path: `/backups/${name}`,
  createdAt: '2026-08-16T12:00:00.000Z',
  sizeBytes,
});

function fakeIO(overrides: Partial<DriveSyncIO> = {}) {
  const state: { current: DriveState } = { current: { ...emptyState(), linked: true, account: 'gym@example.it', folderId: 'folder-1' } };
  const remote: RemoteArchive[] = [];

  const io: DriveSyncIO = {
    readState: vi.fn(async () => state.current),
    writeState: vi.fn(async (next: DriveState) => {
      state.current = next;
    }),
    readTokens: vi.fn(async () => ({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 })),
    writeTokens: vi.fn(async () => undefined),
    clearTokens: vi.fn(async () => undefined),
    authorize: vi.fn(async () => ({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 })),
    ensureFresh: vi.fn(async (t) => t),
    accountEmail: vi.fn(async () => 'gym@example.it'),
    ensureFolder: vi.fn(async () => 'folder-1'),
    listRemote: vi.fn(async () => remote),
    upload: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    localArchives: vi.fn(async () => [] as BackupEntry[]),
    log: vi.fn(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };

  return { io, state, remote };
}

describe('sync', () => {
  it('does nothing at all when the account is not linked', async () => {
    const { io } = fakeIO({ readState: vi.fn(async () => emptyState()) });

    const result = await new DriveSyncService(io).sync();

    expect(result).toEqual({ ran: false, reason: 'not_linked' });
    // Not even a token read: an unlinked app must not touch the keychain.
    expect(io.readTokens).not.toHaveBeenCalled();
    expect(io.listRemote).not.toHaveBeenCalled();
  });

  it('uploads a local archive the account is missing', async () => {
    const { io } = fakeIO({ localArchives: vi.fn(async () => [archive('budojo-backup-20260816-120000.zip')]) });

    const result = await new DriveSyncService(io).sync();

    expect(result).toMatchObject({ ran: true, uploaded: 1 });
    expect(io.upload).toHaveBeenCalledWith(
      expect.anything(),
      'folder-1',
      '/backups/budojo-backup-20260816-120000.zip',
      'budojo-backup-20260816-120000.zip',
    );
  });

  // Ordering is the safety property: a prune that ran first could delete the
  // only remote copy and then fail to upload its replacement.
  it('uploads before it deletes', async () => {
    const order: string[] = [];
    // Nine archives from ONE day. The service owns its policy, so the way to
    // force a prune is to give it something the policy must prune: the daily
    // tier keeps one archive per day, and `keepRecent` cannot hold nine.
    const remotes = Array.from({ length: 9 }, (_, i) => ({
      name: `budojo-backup-20260801-0${i}0000.zip`,
      id: `id-${i}`,
      size: 100,
    }));

    const { io } = fakeIO({
      localArchives: vi.fn(async () => [archive('budojo-backup-20260816-120000.zip')]),
      listRemote: vi.fn(async () => remotes),
      upload: vi.fn(async () => {
        order.push('upload');
      }),
      remove: vi.fn(async () => {
        order.push('delete');
      }),
    });

    await new DriveSyncService(io).sync();

    expect(order[0]).toBe('upload');
    expect(order).toContain('delete');
  });

  it('records a success even when there was nothing to upload', async () => {
    const { io, state } = fakeIO();

    const result = await new DriveSyncService(io).sync();

    expect(result).toMatchObject({ ran: true, uploaded: 0 });
    expect(state.current.lastSyncAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(state.current.lastError).toBeNull();
  });

  it('records the failure and does NOT throw when the upload fails', async () => {
    // The caller is a 6-hourly timer. A throw here would surface as an
    // unhandled rejection in the main process, which is a far worse outcome
    // than a stale cloud copy.
    const { io, state } = fakeIO({
      localArchives: vi.fn(async () => [archive('budojo-backup-20260816-120000.zip')]),
      upload: vi.fn(async () => {
        throw Object.assign(new Error('nope'), { code: 'storageQuotaExceeded' });
      }),
    });

    const result = await new DriveSyncService(io).sync();

    expect(result).toMatchObject({ ran: true, error: 'storageQuotaExceeded' });
    expect(state.current.lastError).toBe('storageQuotaExceeded');
    expect(state.current.consecutiveFailures).toBe(1);
  });

  it('keeps the previous success time when a later sync fails', async () => {
    const { io, state } = fakeIO({
      localArchives: vi.fn(async () => [archive('a')]),
      listRemote: vi.fn(async () => {
        throw Object.assign(new Error('down'), { code: 'network' });
      }),
    });
    state.current = { ...state.current, lastSyncAt: '2026-08-15T09:00:00.000Z' };

    await new DriveSyncService(io).sync();

    expect(state.current.lastSyncAt).toBe('2026-08-15T09:00:00.000Z');
    expect(state.current.lastError).toBe('network');
  });

  it('refreshes the token before using it', async () => {
    const { io } = fakeIO();

    await new DriveSyncService(io).sync();

    expect(io.ensureFresh).toHaveBeenCalled();
  });

  // A revoked grant is not a transient error: the link is dead until the owner
  // reconnects, and the UI has to say so rather than showing a healthy link.
  it('marks the link broken when the refresh token is rejected', async () => {
    const { io, state } = fakeIO({
      ensureFresh: vi.fn(async () => {
        throw Object.assign(new Error('revoked'), { code: 'invalid_grant' });
      }),
    });

    await new DriveSyncService(io).sync();

    expect(state.current.lastError).toBe('invalid_grant');
  });

  // "Never throws" has to survive the disk failing, not just the network. The
  // 6-hourly caller is guarded, but the IPC bridge returns this promise bare —
  // a rejection there leaves the renderer's spinner turning with no message.
  it('does not throw when reading the state fails', async () => {
    const { io } = fakeIO({
      readState: vi.fn(async () => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      }),
    });

    await expect(new DriveSyncService(io).sync()).resolves.toMatchObject({ ran: true, error: 'EPERM' });
  });

  it('does not throw when recording the failure ALSO fails', async () => {
    const { io } = fakeIO({
      listRemote: vi.fn(async () => {
        throw Object.assign(new Error('down'), { code: 'network' });
      }),
      writeState: vi.fn(async () => {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }),
    });

    // The original network error survives; the disk error on top of it does not
    // become the thing that escapes.
    await expect(new DriveSyncService(io).sync()).resolves.toMatchObject({ ran: true, error: 'network' });
  });
});

describe('link', () => {
  it('stores the tokens, resolves the folder and records the account', async () => {
    const { io, state } = fakeIO({ readState: vi.fn(async () => emptyState()) });

    const result = await new DriveSyncService(io).link();

    expect(result).toMatchObject({ ok: true, account: 'gym@example.it' });
    expect(io.writeTokens).toHaveBeenCalled();
    expect(state.current).toMatchObject({ linked: true, account: 'gym@example.it', folderId: 'folder-1' });
  });

  it('leaves nothing behind when the user cancels the consent screen', async () => {
    const { io } = fakeIO({
      readState: vi.fn(async () => emptyState()),
      authorize: vi.fn(async () => {
        throw Object.assign(new Error('denied'), { code: 'access_denied' });
      }),
    });

    const result = await new DriveSyncService(io).link();

    expect(result).toMatchObject({ ok: false, error: 'access_denied' });
    // Persisting NOTHING is the property. Asserting on the fixture's own state
    // object would just read back the value the fixture was built with, which
    // is true whatever the code does.
    expect(io.writeTokens).not.toHaveBeenCalled();
    expect(io.writeState).not.toHaveBeenCalled();
  });

  it('does not write the link until the folder resolves', async () => {
    // Consent can succeed and the folder call still fail. Writing the state
    // first would show a connected account that cannot upload anywhere.
    const { io } = fakeIO({
      readState: vi.fn(async () => emptyState()),
      ensureFolder: vi.fn(async () => {
        throw Object.assign(new Error('nope'), { code: 'storageQuotaExceeded' });
      }),
    });

    const result = await new DriveSyncService(io).link();

    expect(result).toMatchObject({ ok: false, error: 'storageQuotaExceeded' });
    expect(io.writeState).not.toHaveBeenCalled();
    expect(io.writeTokens).not.toHaveBeenCalled();
  });
});

describe('unlink', () => {
  it('revokes the grant, clears the keychain and forgets the account', async () => {
    const { io, state } = fakeIO();

    await new DriveSyncService(io).unlink();

    expect(io.revoke).toHaveBeenCalled();
    expect(io.clearTokens).toHaveBeenCalled();
    expect(state.current.linked).toBe(false);
    expect(state.current.account).toBeNull();
  });

  it('still clears local state when the revoke call fails', async () => {
    // Google being unreachable must not leave the app pretending it is linked.
    const { io, state } = fakeIO({
      revoke: vi.fn(async () => {
        throw new Error('offline');
      }),
    });

    await new DriveSyncService(io).unlink();

    expect(io.clearTokens).toHaveBeenCalled();
    expect(state.current.linked).toBe(false);
  });

  it('never uploads anything after unlinking', async () => {
    const { io } = fakeIO({ localArchives: vi.fn(async () => [archive('a')]) });
    const service = new DriveSyncService(io);

    await service.unlink();
    const result = await service.sync();

    expect(result).toEqual({ ran: false, reason: 'not_linked' });
    expect(io.upload).not.toHaveBeenCalled();
  });
});
