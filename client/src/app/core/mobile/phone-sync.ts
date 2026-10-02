import { inject, Provider } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DriveRemote } from '../sync/drive-remote';
import { RemoteError, SyncRemote } from '../sync/remote';
import { SYNC_PLATFORM, SyncPlatform } from '../sync/sync.service';
import { DeviceService } from './device.service';
import { DriveAuthPlugin } from './drive-auth';
import { PhpServerPlugin, restartPhoneServer } from './phone-server';
import { DRIVE_AUTH, PHP_SERVER } from './shell-plugins';

/**
 * The phone's side of the sync (#2046, PRD § 5.6):
 * - **the identity** from `PhpServerPlugin`, which keeps it beside the app keys
 *   once the door joined the phone (`adoptKeys`);
 * - **Drive** from the page, with `DriveAuthPlugin`'s token;
 * - **the swap** by restarting the server, which swaps a staged database in at
 *   every start. The database swapped in is another device's, and holds none
 *   of this phone's sessions: the owner's comes back through the shell's
 *   secret (`/device/session`, #2079), as at the door, before the round goes
 *   on to its next call.
 *
 * The phone joins with the keys the PC made, so it never publishes into an
 * empty folder: the PC does (`publishesFirst`).
 */
export function phoneSyncPlatform(
  server: PhpServerPlugin,
  drive: DriveAuthPlugin,
  reopenSession: () => Promise<void>,
): SyncPlatform {
  let lastToken: string | null = null;
  const token = async (): Promise<string> => {
    try {
      lastToken = (await drive.authorize({ interactive: false })).accessToken;
      return lastToken;
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === 'NEEDS_CONSENT') {
        throw new RemoteError('unauthorized', 'Google wants the owner to sign in again');
      }
      throw error;
    }
  };
  const dropToken = async (): Promise<void> => {
    if (lastToken !== null) {
      await drive.clearToken({ token: lastToken }).catch(() => undefined);
      lastToken = null;
    }
  };
  return {
    identity: async () => {
      const { device, folder, syncKey } = await server.syncIdentity();
      return device && folder && syncKey ? { device, folder, syncKey } : null;
    },
    remote: freshTokenOnce(new DriveRemote(token), dropToken),
    shell: {
      swapIn: () => restartPhoneServer(server, reopenSession),
    },
    publishesFirst: false,
    reconnect: async () => {
      await dropToken();
      await drive.authorize({ interactive: true });
    },
  };
}

/**
 * Google can hand out a token it cached and Drive then refuses: the call is
 * made once more with a new one before the owner is asked for anything.
 */
export function freshTokenOnce(remote: SyncRemote, dropToken: () => Promise<void>): SyncRemote {
  const once = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof RemoteError) || error.reason !== 'unauthorized') {
        throw error;
      }
      await dropToken();
      return call();
    }
  };
  return {
    list: (folder) => once(() => remote.list(folder)),
    read: (path) => once(() => remote.read(path)),
    write: (path, bytes) => once(() => remote.write(path, bytes)),
    remove: (path) => once(() => remote.remove(path)),
  };
}

/** The sync on the phone: on when both plugins are there, as they are inside the app. */
export function providePhoneSync(): Provider {
  return {
    provide: SYNC_PLATFORM,
    useFactory: (): SyncPlatform | null => {
      const server = inject(PHP_SERVER);
      const drive = inject(DRIVE_AUTH);
      const device = inject(DeviceService);
      const auth = inject(AuthService);
      return server === null || drive === null
        ? null
        : phoneSyncPlatform(server, drive, async () => {
            auth.adoptSession(await firstValueFrom(device.session()));
          });
    },
  };
}
