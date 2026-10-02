import { describe, expect, it, vi } from 'vitest';
import { MemoryRemote, RemoteError, SyncRemote } from '../sync/remote';
import { DriveAuthPlugin } from './drive-auth';
import { PhpServerPlugin } from './phone-server';
import { freshTokenOnce, phoneSyncPlatform } from './phone-sync';

/** The phone's side of the sync (#2046): its identity, Drive with Google's token, and the swap. */
describe('the phone’s sync platform', () => {
  function server(identity: Awaited<ReturnType<PhpServerPlugin['syncIdentity']>>): PhpServerPlugin {
    return {
      start: vi.fn(async () => ({ port: 8000 })),
      restart: vi.fn(async () => ({ port: 8000 })),
      adoptKeys: vi.fn(async () => ({ changed: false })),
      syncIdentity: vi.fn(async () => identity),
    };
  }

  const drive = (authorize: DriveAuthPlugin['authorize']): DriveAuthPlugin => ({
    authorize: vi.fn(authorize),
    clearToken: vi.fn(async () => undefined),
  });

  it('has no identity until the door joined the phone', async () => {
    const platform = phoneSyncPlatform(
      server({}),
      drive(async () => ({ accessToken: 't' })),
      async () => undefined,
    );

    expect(await platform.identity()).toBeNull();
    expect(platform.publishesFirst).toBe(false);
  });

  it('hands over the identity the plugin keeps', async () => {
    const identity = { device: 'phone9c1e', folder: 'a'.repeat(32), syncKey: 'k' };
    const platform = phoneSyncPlatform(
      server(identity),
      drive(async () => ({ accessToken: 't' })),
      async () => undefined,
    );

    expect(await platform.identity()).toEqual(identity);
  });

  it('says Google wants the owner again, as the sync pill does, when it needs consent', async () => {
    const platform = phoneSyncPlatform(
      server({}),
      drive(async () => {
        throw Object.assign(new Error('consent'), { code: 'NEEDS_CONSENT' });
      }),
      async () => undefined,
    );

    await expect(platform.remote.list('versions')).rejects.toMatchObject({
      reason: 'unauthorized',
    });
  });

  it('asks Google again on the owner’s tap, after dropping the token it had', async () => {
    const google = drive(async () => ({ accessToken: 'cached' }));
    const fetcher = vi.fn(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('CapacitorWebFetch', fetcher);
    const platform = phoneSyncPlatform(server({}), google, async () => undefined);
    await platform.remote.list('versions').catch(() => undefined);

    await platform.reconnect();

    expect(google.clearToken).toHaveBeenCalledWith({ token: 'cached' });
    expect(google.authorize).toHaveBeenLastCalledWith({ interactive: true });
    vi.unstubAllGlobals();
  });

  it('swaps in by a restart, then opens the owner’s session again on the database it brought', async () => {
    const steps: string[] = [];
    const php = server({});
    (php.restart as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      steps.push('restart');
      return { port: 8000 };
    });
    const platform = phoneSyncPlatform(
      php,
      drive(async () => ({ accessToken: 't' })),
      async () => {
        steps.push('session');
      },
    );

    await platform.shell.swapIn();

    expect(steps).toEqual(['restart', 'session']);
  });

  describe('freshTokenOnce', () => {
    function refusingOnce(): { remote: SyncRemote; calls: () => number } {
      const memory = new MemoryRemote();
      let calls = 0;
      return {
        remote: {
          list: async (folder) => {
            calls++;
            if (calls === 1) {
              throw new RemoteError('unauthorized', 'a token Google cached and Drive refused');
            }
            return memory.list(folder);
          },
          read: (path) => memory.read(path),
          write: (path, bytes) => memory.write(path, bytes),
          remove: (path) => memory.remove(path),
        },
        calls: () => calls,
      };
    }

    it('drops a refused token and tries once more before telling anyone', async () => {
      const { remote, calls } = refusingOnce();
      const drop = vi.fn(async () => undefined);

      await freshTokenOnce(remote, drop).list('versions');

      expect(drop).toHaveBeenCalledTimes(1);
      expect(calls()).toBe(2);
    });

    it('tries once only: a second refusal is the owner’s to answer', async () => {
      const refusing: SyncRemote = {
        list: async () => {
          throw new RemoteError('unauthorized', 'no');
        },
        read: async () => null,
        write: async () => undefined,
        remove: async () => undefined,
      };

      await expect(
        freshTokenOnce(refusing, async () => undefined).list('versions'),
      ).rejects.toThrow('no');
    });

    it('does not try again when the network is gone', async () => {
      const drop = vi.fn(async () => undefined);
      const offline: SyncRemote = {
        list: async () => {
          throw new RemoteError('offline', 'no network');
        },
        read: async () => null,
        write: async () => undefined,
        remove: async () => undefined,
      };

      await expect(freshTokenOnce(offline, drop).list('versions')).rejects.toThrow('no network');
      expect(drop).not.toHaveBeenCalled();
    });
  });
});
