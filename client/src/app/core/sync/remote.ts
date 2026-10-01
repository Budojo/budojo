import { isLayoutPath } from './layout';

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
  /** When the store created the file, on its own clock, in milliseconds (`decide.ts` orders twins by it). */
  created: number;
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

export function folderOf(path: string): RemoteFolder | null {
  const folder = path.split('/')[0];
  return folder === 'versions' || folder === 'files' || folder === 'devices' ? folder : null;
}

/**
 * Throws on a path the protocol does not define: a remote never writes anywhere
 * else. Each folder's own rule applies (`layout.ts`): a numbered version with
 * its parent, a SHA-256, a device id.
 */
export function assertLayoutPath(path: string): void {
  if (!isLayoutPath(path)) {
    throw new Error(`"${path}" is not a path in the sync folder`);
  }
}

/**
 * The tests' remote: a map, with copies on the way in and out, as a real store
 * would. Its clock is a counter unless a test hands it one.
 */
export class MemoryRemote implements SyncRemote {
  readonly files = new Map<string, { bytes: Uint8Array; created: number }>();
  private tick = 0;

  constructor(private readonly clock: () => number = () => ++this.tick) {}

  async list(folder: RemoteFolder): Promise<RemoteFile[]> {
    return [...this.files.entries()]
      .filter(([path]) => folderOf(path) === folder)
      .map(([path, file]) => ({ path, size: file.bytes.length, created: file.created }));
  }

  async read(path: string): Promise<Uint8Array | null> {
    const file = this.files.get(path);
    return file === undefined ? null : new Uint8Array(file.bytes);
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    assertLayoutPath(path);
    // Replacing a file keeps its creation time, as Drive's update does.
    const created = this.files.get(path)?.created ?? this.clock();
    this.files.set(path, { bytes: new Uint8Array(bytes), created });
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}
