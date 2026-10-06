import { describe, expect, it, vi } from 'vitest';

import type { BackupEntry } from './backup.js';
import { generateSecrets } from './bootstrap.js';
import type { DriveTokens } from './drive-io.js';
import { DriveSyncService, type DriveSyncIO } from './drive-service.js';
import { emptyState, type DriveState } from './drive-state.js';
import type { RemoteArchive } from './drive-sync.js';
import { APPDATA_SCOPE, DRIVE_SCOPE } from './drive-auth.js';
import type { DriveItem } from './sync-bridge.js';
import { newAcademyKeys, parseAcademyKeys } from './sync-keys.js';

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

const SECRETS = generateSecrets();

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
    authorizeWithAppData: vi.fn(async () => ({
      accessToken: 'at2',
      refreshToken: 'rt2',
      expiresAt: Date.now() + 3_600_000,
      scope: `${DRIVE_SCOPE} ${APPDATA_SCOPE}`,
    })),
    localSecrets: vi.fn(async () => SECRETS),
    findKeys: vi.fn(async (): Promise<string[]> => []),
    readKeys: vi.fn(async () => ''),
    writeKeys: vi.fn(async () => undefined),
    ensureFresh: vi.fn(async (t) => t),
    fetchDrive: vi.fn(async () => ({ status: 200, headers: {}, body: new Uint8Array() })),
    readItem: vi.fn(async (): Promise<DriveItem | null> => null),
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

  // #2059: the launch-time backup task and «Copia adesso» both ran sync(), both
  // listed an empty folder, and both uploaded every archive.
  it('joins a sync already running instead of starting a second one', async () => {
    let release: () => void = () => undefined;
    const uploading = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { io } = fakeIO({
      localArchives: vi.fn(async () => [archive('budojo-backup-20260816-120000.zip')]),
      upload: vi.fn(() => uploading),
    });
    const service = new DriveSyncService(io);

    const first = service.sync();
    const second = service.sync();
    release();

    expect(await second).toEqual(await first);
    expect(io.upload).toHaveBeenCalledTimes(1);
    expect(io.listRemote).toHaveBeenCalledTimes(1);
  });

  // #2060 review: a sync joined across a relink would report the old account's
  // result for the new one, and then write the old account back over it.
  it('starts fresh after a relink, and the stale sync leaves the new link alone', async () => {
    let release: () => void = () => undefined;
    const uploading = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { io, state } = fakeIO({
      localArchives: vi.fn(async () => [archive('budojo-backup-20260816-120000.zip')]),
      upload: vi.fn(() => uploading),
      accountEmail: vi.fn(async () => 'other@example.it'),
      ensureFolder: vi.fn(async () => 'folder-2'),
    });
    const service = new DriveSyncService(io);

    const stale = service.sync();
    await service.unlink();
    await service.link();
    const fresh = service.sync();
    release();
    await Promise.all([stale, fresh]);

    expect(io.listRemote).toHaveBeenCalledWith(expect.anything(), 'folder-2');
    expect(state.current).toMatchObject({ linked: true, account: 'other@example.it', folderId: 'folder-2' });
  });

  // #2060 review, second round: the generation check and the state write were
  // two steps, so a stale write already under way could land after a relink's.
  it('lands state writes in order, so a stale write never lands after a relink', async () => {
    let releaseWrite: () => void = () => undefined;
    let held = true;
    const { io, state } = fakeIO({
      localArchives: vi.fn(async () => [archive('budojo-backup-20260816-120000.zip')]),
      upload: vi.fn(async () => {
        throw Object.assign(new Error('network'), { code: 'upload_failed' });
      }),
      accountEmail: vi.fn(async () => 'other@example.it'),
      ensureFolder: vi.fn(async () => 'folder-2'),
    });
    const write = io.writeState;
    io.writeState = vi.fn(async (next: DriveState) => {
      if (held) {
        held = false;
        await new Promise<void>((resolve) => {
          releaseWrite = resolve;
        });
      }
      await write(next);
    });
    const service = new DriveSyncService(io);

    const stale = service.sync();
    await vi.waitFor(() => expect(io.writeState).toHaveBeenCalledTimes(1));
    const relink = (async () => {
      await service.unlink();
      await service.link();
    })();
    // Let the relink get as far as it can while the stale write is held.
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseWrite();
    await Promise.all([stale, relink]);

    expect(state.current).toMatchObject({ linked: true, account: 'other@example.it', folderId: 'folder-2' });
  });

  it('runs again once the previous sync has finished', async () => {
    const { io } = fakeIO();
    const service = new DriveSyncService(io);

    await service.sync();
    await service.sync();

    expect(io.listRemote).toHaveBeenCalledTimes(2);
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

/**
 * Bringing the gym to the phone (#2033): a second consent, for the account's
 * hidden application data, then the academy's keys there for the phone.
 */
describe('connectPhone', () => {
  it('asks Google for the hidden data, keeps the new tokens, and writes this PC\'s keys when none are there', async () => {
    const { io, state } = fakeIO();

    const result = await new DriveSyncService(io).connectPhone();

    expect(result).toEqual({ ok: true, keys: 'published' });
    expect(io.writeTokens).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'rt2' }));
    const written = parseAcademyKeys(vi.mocked(io.writeKeys).mock.calls[0]?.[1] ?? '');
    expect(written).toMatchObject({ APP_KEY: SECRETS.APP_KEY, DOCUMENT_ENCRYPTION_KEY: SECRETS.DOCUMENT_ENCRYPTION_KEY });
    expect(state.current.keysPublishedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('writes nothing when this PC\'s keys are already there', async () => {
    const mine = JSON.stringify(newAcademyKeys(SECRETS, new Date()));
    const { io } = fakeIO({ findKeys: vi.fn(async () => ['keys-1']), readKeys: vi.fn(async () => mine) });

    const result = await new DriveSyncService(io).connectPhone();

    expect(result).toEqual({ ok: true, keys: 'already' });
    expect(io.writeKeys).not.toHaveBeenCalled();
  });

  it('never overwrites other keys: their documents and their sync would stop opening', async () => {
    const theirs = JSON.stringify(newAcademyKeys(generateSecrets(), new Date()));
    const { io, state } = fakeIO({ findKeys: vi.fn(async () => ['keys-1']), readKeys: vi.fn(async () => theirs) });

    const result = await new DriveSyncService(io).connectPhone();

    expect(result).toEqual({ ok: false, error: 'keys_differ' });
    expect(io.writeKeys).not.toHaveBeenCalled();
    expect(state.current.keysPublishedAt).toBeNull();
  });

  it('asks nothing of Google while Drive is not linked', async () => {
    const { io } = fakeIO({ readState: vi.fn(async () => emptyState()) });

    expect(await new DriveSyncService(io).connectPhone()).toEqual({ ok: false, error: 'not_linked' });
    expect(io.authorizeWithAppData).not.toHaveBeenCalled();
  });

  it('answers with the reason when the consent fails, and never throws', async () => {
    const { io } = fakeIO({
      authorizeWithAppData: vi.fn(async () => {
        throw Object.assign(new Error('closed'), { code: 'consent_timeout' });
      }),
    });

    expect(await new DriveSyncService(io).connectPhone()).toEqual({ ok: false, error: 'consent_timeout' });
    expect(io.writeKeys).not.toHaveBeenCalled();
  });

  it('saves nothing when the consent did not grant both scopes: the backups keep working', async () => {
    const { io } = fakeIO({
      authorizeWithAppData: vi.fn(async () => ({ accessToken: 'at2', refreshToken: 'rt2', expiresAt: null, scope: APPDATA_SCOPE })),
    });

    expect(await new DriveSyncService(io).connectPhone()).toEqual({ ok: false, error: 'scopes_missing' });
    expect(io.writeTokens).not.toHaveBeenCalled();
    expect(io.writeKeys).not.toHaveBeenCalled();
  });

  it('saves nothing for another Google account, and lets go of its grant', async () => {
    const { io } = fakeIO({ accountEmail: vi.fn(async () => 'someone@else.it') });

    expect(await new DriveSyncService(io).connectPhone()).toEqual({ ok: false, error: 'other_account' });
    expect(io.writeTokens).not.toHaveBeenCalled();
    expect(io.writeKeys).not.toHaveBeenCalled();
    expect(io.revoke).toHaveBeenCalledWith('rt2');
  });

  it('picks no keys when the account holds two files of them', async () => {
    const { io } = fakeIO({ findKeys: vi.fn(async () => ['keys-1', 'keys-2']) });

    expect(await new DriveSyncService(io).connectPhone()).toEqual({ ok: false, error: 'keys_ambiguous' });
    expect(io.writeKeys).not.toHaveBeenCalled();
  });

  it('runs once for two calls at once: never two keys files', async () => {
    let consent: () => void = () => undefined;
    const { io } = fakeIO({
      authorizeWithAppData: vi.fn(
        () =>
          new Promise<DriveTokens>((resolve) => {
            consent = () =>
              resolve({ accessToken: 'at2', refreshToken: 'rt2', expiresAt: null, scope: `${DRIVE_SCOPE} ${APPDATA_SCOPE}` });
          }),
      ),
    });
    const service = new DriveSyncService(io);

    const first = service.connectPhone();
    const second = service.connectPhone();
    await vi.waitFor(() => expect(io.authorizeWithAppData).toHaveBeenCalled());
    consent();

    expect(await first).toEqual({ ok: true, keys: 'published' });
    expect(await second).toEqual({ ok: true, keys: 'published' });
    expect(io.authorizeWithAppData).toHaveBeenCalledTimes(1);
    expect(io.writeKeys).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when Drive was disconnected while Google asked', async () => {
    let consent: () => void = () => undefined;
    const { io } = fakeIO({
      authorizeWithAppData: vi.fn(
        () =>
          new Promise<DriveTokens>((resolve) => {
            consent = () =>
              resolve({ accessToken: 'at2', refreshToken: 'rt2', expiresAt: null, scope: `${DRIVE_SCOPE} ${APPDATA_SCOPE}` });
          }),
      ),
    });
    const service = new DriveSyncService(io);

    const connecting = service.connectPhone();
    await vi.waitFor(() => expect(io.authorizeWithAppData).toHaveBeenCalled());
    await service.unlink();
    consent();

    expect(await connecting).toEqual({ ok: false, error: 'link_changed' });
    expect(io.writeKeys).not.toHaveBeenCalled();
  });

  it('keeps the date through a backup sync that was running while it connected', async () => {
    let listed: () => void = () => undefined;
    const { io, state } = fakeIO({
      // The sync reads its state, then waits on Drive's listing.
      listRemote: vi.fn(
        () =>
          new Promise<RemoteArchive[]>((resolve) => {
            listed = () => resolve([]);
          }),
      ),
    });
    const service = new DriveSyncService(io);

    const syncing = service.sync();
    await vi.waitFor(() => expect(io.listRemote).toHaveBeenCalled());
    await service.connectPhone();
    listed();
    await syncing;

    expect(state.current.keysPublishedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('keeps the date through a reconnect to the same account, and asks for both scopes then', async () => {
    const { io, state } = fakeIO();
    const service = new DriveSyncService(io);
    await service.connectPhone();

    await service.link();

    expect(state.current.keysPublishedAt).not.toBeNull();
    expect(io.authorizeWithAppData).toHaveBeenCalledTimes(2);
  });

  it('forgets the date when the reconnect is to another account', async () => {
    const { io, state } = fakeIO();
    const service = new DriveSyncService(io);
    await service.connectPhone();
    vi.mocked(io.accountEmail).mockResolvedValue('other@example.it');

    await service.link();

    expect(state.current.keysPublishedAt).toBeNull();
  });
});

describe('the sync’s keys and Drive calls (#2032)', () => {
  const KEYS = JSON.stringify({
    v: 1,
    folder: '0123456789abcdef0123456789abcdef',
    syncKey: Buffer.alloc(32, 7).toString('base64'),
    createdAt: '2026-10-02T18:00:00.000Z',
    ...SECRETS,
  });

  it('reads the keys only once this PC connected the phone', async () => {
    const { io, state } = fakeIO({ findKeys: vi.fn(async () => ['keys-1']), readKeys: vi.fn(async () => KEYS) });
    const service = new DriveSyncService(io);

    expect(await service.keysForSync()).toBeNull();
    expect(io.findKeys).not.toHaveBeenCalled();

    state.current = { ...state.current, keysPublishedAt: '2026-10-02T18:00:00.000Z' };
    expect((await service.keysForSync())?.folder).toBe('0123456789abcdef0123456789abcdef');
  });

  it('picks no keys from an account that holds two files of them', async () => {
    const { io, state } = fakeIO({ findKeys: vi.fn(async () => ['keys-1', 'keys-2']) });
    state.current = { ...state.current, keysPublishedAt: '2026-10-02T18:00:00.000Z' };

    await expect(new DriveSyncService(io).keysForSync()).rejects.toMatchObject({ code: 'keys_ambiguous' });
    expect(io.readKeys).not.toHaveBeenCalled();
  });

  it('makes the page’s call with its own fresh token', async () => {
    const fresh = { accessToken: 'fresh', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 };
    const { io } = fakeIO({ ensureFresh: vi.fn(async () => fresh) });
    const request = { url: 'https://www.googleapis.com/drive/v3/files', method: 'GET', headers: {} };

    await new DriveSyncService(io).fetchForSync(request);

    expect(io.fetchDrive).toHaveBeenCalledWith(fresh, request);
    expect(io.writeTokens).toHaveBeenCalledWith(fresh);
  });

  it('answers 401 when Google no longer gives a token: the page asks the owner to reconnect', async () => {
    const { io } = fakeIO({ readTokens: vi.fn(async () => null) });

    const answer = await new DriveSyncService(io).fetchForSync({
      url: 'https://www.googleapis.com/drive/v3/files',
      method: 'GET',
      headers: {},
    });

    expect(answer.status).toBe(401);
    expect(io.fetchDrive).not.toHaveBeenCalled();
  });
});

/**
 * The sync's deletes (#2120): the device that pushes prunes the folder's
 * versions (#2117). The page asks, and the main process forwards a delete only
 * for a version in this PC's sync folder: never a backup or any other file.
 */
describe('the sync’s deletes (#2120)', () => {
  const FOLDER = 'application/vnd.google-apps.folder';
  const VERSION = '000045-phone9c1e.000044-pc4f2a.bjs';
  const item = (id: string, name: string, parent: string, mimeType = 'application/octet-stream'): DriveItem => ({
    id,
    name,
    mimeType,
    parents: [parent],
  });
  /** The owner's Drive: `folder-1` is the `Budojo` folder this PC linked, with its backups and the sync folder. */
  const DRIVE: DriveItem[] = [
    item('folder-1', 'Budojo', 'root', FOLDER),
    item('backup-1', 'budojo-backup-20261006-120000.zip', 'folder-1', 'application/zip'),
    item('stray-1', VERSION, 'folder-1'),
    item('sync-1', 'sync', 'folder-1', FOLDER),
    item('id-1', 'folder.bjs', 'sync-1'),
    item('versions-1', 'versions', 'sync-1', FOLDER),
    item('version-45', VERSION, 'versions-1'),
    item('devices-1', 'devices', 'sync-1', FOLDER),
    item('report-1', 'pc4f2a.bjs', 'devices-1'),
    item('other-1', 'Altro', 'root', FOLDER),
    item('doc-1', 'certificato.pdf', 'other-1', 'application/pdf'),
    item('other-sync', 'sync', 'other-1', FOLDER),
    item('other-versions', 'versions', 'other-sync', FOLDER),
    item('other-version', VERSION, 'other-versions'),
  ];
  const deleteOf = (id: string, url = `https://www.googleapis.com/drive/v3/files/${id}`) => ({
    url,
    method: 'DELETE',
    headers: {},
  });

  function onDrive(overrides: Partial<DriveSyncIO> = {}) {
    const found = fakeIO({
      readItem: vi.fn(async (_tokens: DriveTokens, id: string) => DRIVE.find((entry) => entry.id === id) ?? null),
      ...overrides,
    });

    return { ...found, service: new DriveSyncService(found.io) };
  }

  it('forwards a version’s delete, in `versions/` of the sync folder of the `Budojo` folder this PC linked', async () => {
    const { io, service } = onDrive();

    const answer = await service.fetchForSync(deleteOf('version-45'));

    expect(answer.status).toBe(200);
    expect(io.fetchDrive).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'at' }), deleteOf('version-45'));
  });

  it.each([
    ['a backup', 'backup-1'],
    ['the folder’s id', 'id-1'],
    ['a report', 'report-1'],
    ['a document outside the sync folder', 'doc-1'],
    ['a version’s name beside the backups', 'stray-1'],
    ['a version’s name in another sync folder', 'other-version'],
    ['the versions folder itself', 'versions-1'],
    ['the `Budojo` folder', 'folder-1'],
  ])('refuses %s with a 403, and never forwards it', async (_what, id) => {
    const { io, service } = onDrive();

    const answer = await service.fetchForSync(deleteOf(id));

    expect(answer.status).toBe(403);
    expect(io.fetchDrive).not.toHaveBeenCalled();
    expect(io.log).toHaveBeenCalledWith(`sync: refused to delete ${id}`);
  });

  it('reads no further than the first link that fails: a backup is one read', async () => {
    const { io, service } = onDrive();

    await service.fetchForSync(deleteOf('backup-1'));

    expect(io.readItem).toHaveBeenCalledTimes(1);
  });

  it('refuses before the token is used: Drive not linked, or a delete of anything but one bare file', async () => {
    const unlinked = onDrive({ readState: vi.fn(async () => emptyState()) });
    expect((await unlinked.service.fetchForSync(deleteOf('version-45'))).status).toBe(403);
    expect(unlinked.io.readTokens).not.toHaveBeenCalled();

    const { io, service } = onDrive();
    const withParameter = deleteOf('version-45', 'https://www.googleapis.com/drive/v3/files/version-45?fields=id');
    expect((await service.fetchForSync(withParameter)).status).toBe(403);
    expect((await service.fetchForSync(deleteOf('', 'https://www.googleapis.com/drive/v3/files'))).status).toBe(403);
    expect(io.readTokens).not.toHaveBeenCalled();
    expect(io.readItem).not.toHaveBeenCalled();
    expect(io.fetchDrive).not.toHaveBeenCalled();
  });

  it('answers 404 for a file already gone: the other device pruned it first', async () => {
    const { io, service } = onDrive();

    const answer = await service.fetchForSync(deleteOf('version-44'));

    expect(answer.status).toBe(404);
    expect(io.fetchDrive).not.toHaveBeenCalled();
  });

  it('refuses a version whose folder cannot be read', async () => {
    const { io, service } = onDrive({
      readItem: vi.fn(async (_tokens: DriveTokens, id: string) =>
        id === 'version-45' ? (DRIVE.find((entry) => entry.id === id) ?? null) : null,
      ),
    });

    expect((await service.fetchForSync(deleteOf('version-45'))).status).toBe(403);
    expect(io.fetchDrive).not.toHaveBeenCalled();
  });

  it('answers 401 when Google no longer gives a token, and reads nothing', async () => {
    const { io, service } = onDrive({ readTokens: vi.fn(async () => null) });

    expect((await service.fetchForSync(deleteOf('version-45'))).status).toBe(401);
    expect(io.readItem).not.toHaveBeenCalled();
  });
});
