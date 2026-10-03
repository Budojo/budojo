import { inject, Provider } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DeviceService } from '../mobile/device.service';
import { AuthService } from '../services/auth.service';
import { DriveRemote, Fetcher } from '../sync/drive-remote';
import { followingFolder, RemoteError } from '../sync/remote';
import { SYNC_PLATFORM, SyncPlatform } from '../sync/sync.service';

/** The preload's sync bridge (`desktop/src/preload.cts`, #2032). */
export type DesktopSyncBridge = BudojoBridge['sync'];

/**
 * Drive's API through the main process (#2032, PRD § 5.6): the same
 * `DriveRemote` as the phone's, whose calls the main process makes with its
 * own token. The page never holds one, so the token `DriveRemote` asks for is a
 * placeholder the main process replaces.
 */
export function bridgeFetcher(bridge: DesktopSyncBridge): Fetcher {
  return async (input, init = {}) => {
    const body = init.body;
    const answer = await bridge.driveFetch({
      url: input,
      method: init.method ?? 'GET',
      headers: { ...((init.headers as Record<string, string> | undefined) ?? {}) },
      ...(typeof body === 'string' || body instanceof Uint8Array ? { body } : {}),
    });
    // A 204, or a 1xx, carries no body, and a Response refuses one.
    const empty = answer.status === 204 || answer.status === 304 || answer.status < 200;
    return new Response(empty ? null : new Uint8Array(answer.body), {
      status: answer.status,
      headers: answer.headers,
    });
  };
}

/**
 * The PC's side of the sync (#2032):
 * - **the identity** from the main process, once the PC connected the phone
 *   and its server journals;
 * - **Drive** through the main process;
 * - **the swap** by the main process's restart, with the bootstrap's
 *   migrations and reconcile. The database swapped in is the phone's, which
 *   holds none of this PC's sessions: the owner's comes back through the
 *   shell's secret (`/device/session`) before the round goes on.
 *
 * The PC made the academy's keys, so it publishes its academy into an empty
 * folder (`publishesFirst`). «Ricollega Google» is the Drive link's own consent
 * (`drive.link`), which asks for both scopes once the keys are published.
 */
export function desktopSyncPlatform(
  bridge: BudojoBridge,
  reopenSession: () => Promise<void>,
): SyncPlatform {
  const drive = followingFolder(
    () => new DriveRemote(async () => 'held-by-the-main-process', bridgeFetcher(bridge.sync)),
  );
  return {
    identity: async () => {
      const identity = await bridge.sync.identity();
      if (identity !== null && 'unauthorized' in identity) {
        throw new RemoteError('unauthorized', 'Google wants the owner to sign in again');
      }
      if (identity !== null && 'offline' in identity) {
        throw new RemoteError('offline', 'no network to read the academy’s keys');
      }
      drive.follow(identity?.folder ?? null);
      return identity;
    },
    remote: drive.remote,
    shell: {
      swapIn: async () => {
        await bridge.sync.swapIn();
        await reopenSession();
      },
    },
    publishesFirst: true,
    reconnect: async () => {
      const linked = await bridge.drive.link();
      if (!linked.ok) {
        throw new Error(linked.error ?? 'Google did not reconnect');
      }
    },
  };
}

/** The sync on the PC: on inside Budojo Desktop, whose preload carries the bridge. */
export function provideDesktopSync(): Provider {
  return {
    provide: SYNC_PLATFORM,
    useFactory: (): SyncPlatform | null => {
      const bridge = typeof window === 'undefined' ? undefined : window.__BUDOJO__;
      const device = inject(DeviceService);
      const auth = inject(AuthService);
      return bridge?.sync === undefined
        ? null
        : desktopSyncPlatform(bridge, async () => {
            auth.adoptSession(await firstValueFrom(device.session()));
          });
    },
  };
}
