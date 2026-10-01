/**
 * Where the sync folder lives (PRD § 5.3, #2029). The engine sees only this:
 * `DriveRemote` on the phone, the PC's main process over the bridge (#2032),
 * and `MemoryRemote` in the tests, where two devices sync with no Google account.
 *
 * Paths are the layout's (`layout.ts`): `keys.bjs`, `versions/…`, `files/…`,
 * `devices/…`. A remote stores bytes; it never sees a key or a plaintext.
 */

export type RemoteFolder = 'versions' | 'files' | 'devices';

export interface RemoteFile {
  path: string;
  size: number;
}

export interface SyncRemote {
  /** Every file in one folder of the layout. An empty or missing folder lists nothing. */
  list(folder: RemoteFolder): Promise<RemoteFile[]>;
  /** The file's bytes, or null when there is no such file. */
  read(path: string): Promise<Uint8Array | null>;
  /**
   * Writes the file, replacing one of the same path. Versions and documents are
   * never written twice by design (new names), so only `keys.bjs` and a
   * device's own `devices/` file are ever replaced.
   */
  write(path: string, bytes: Uint8Array): Promise<void>;
  /** Deletes the file. Deleting one that is not there is not an error. */
  remove(path: string): Promise<void>;
}

/** Why a remote call failed, so the sync state can say "sign in again" rather than "error". */
export type RemoteFailure = 'unauthorized' | 'offline' | 'unavailable';

export class RemoteError extends Error {
  constructor(
    readonly reason: RemoteFailure,
    detail: string,
  ) {
    super(`${reason}: ${detail}`);
  }
}

const TOP_LEVEL = new Set(['keys.bjs']);

export function folderOf(path: string): RemoteFolder | null {
  const folder = path.split('/')[0];
  return folder === 'versions' || folder === 'files' || folder === 'devices' ? folder : null;
}

/** Throws on a path outside the layout: a remote never writes anywhere else. */
export function assertLayoutPath(path: string): void {
  const parts = path.split('/');
  const valid =
    (parts.length === 1 && TOP_LEVEL.has(path)) ||
    (parts.length === 2 && folderOf(path) !== null && /^[0-9a-z-]+\.bjs$/.test(parts[1]));
  if (!valid) {
    throw new Error(`"${path}" is not a path in the sync folder`);
  }
}

/** The tests' remote: a map, with copies on the way in and out, as a real store would. */
export class MemoryRemote implements SyncRemote {
  readonly files = new Map<string, Uint8Array>();

  async list(folder: RemoteFolder): Promise<RemoteFile[]> {
    return [...this.files.entries()]
      .filter(([path]) => folderOf(path) === folder)
      .map(([path, bytes]) => ({ path, size: bytes.length }));
  }

  async read(path: string): Promise<Uint8Array | null> {
    const bytes = this.files.get(path);
    return bytes === undefined ? null : new Uint8Array(bytes);
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    assertLayoutPath(path);
    this.files.set(path, new Uint8Array(bytes));
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}
