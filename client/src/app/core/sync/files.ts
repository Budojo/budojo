import { sha256Hex } from './bytes';
import { EnvelopeError, open, seal } from './envelope';
import { filePath } from './layout';
import { SyncRemote } from './remote';

/**
 * The files side of the sync (#2030 part 2, `docs/sync/protocol.md`).
 *
 * Documents, athletes' photos, avatars and the logo travel apart from the
 * database, one sealed file each, named by its content: `files/<sha256>.bjs`.
 * Every row naming a file records that hash, so a content is matched by what
 * it is, never by its path, which differs between devices for the same
 * athlete. The device's own server says which contents its database names
 * and which it holds (`GET /api/v1/sync/files`).
 */

/** One content the database names, as the server lists it. */
export interface ServerFile {
  sha256: string;
  /** Bytes, when this device holds it. */
  size: number | null;
  /** Held at one of its paths: this device can send it. */
  present: boolean;
  /** Held at every path naming it: nothing left to write here. */
  complete: boolean;
}

/** The device's server: `GET`/`PUT /api/v1/sync/files[/{sha256}]`. */
export interface SyncFilesApi {
  list(): Promise<ServerFile[]>;
  read(sha256: string): Promise<Uint8Array>;
  write(sha256: string, bytes: Uint8Array): Promise<void>;
}

/**
 * Sends every content this device holds and the folder lacks, before the
 * version that names it goes up. A content is never sent twice: its name is
 * its bytes. Returns how many were sent.
 */
export async function pushFiles(
  api: SyncFilesApi,
  remote: SyncRemote,
  key: CryptoKey,
): Promise<number> {
  const inFolder = new Set((await remote.list('files')).files.map((file) => file.path));
  let sent = 0;
  for (const file of await api.list()) {
    const path = filePath(file.sha256);
    if (!file.present || inFolder.has(path)) {
      continue;
    }
    await remote.write(path, await seal(key, path, await api.read(file.sha256)));
    sent++;
  }
  return sent;
}

/**
 * Completes every content this device lacks somewhere. One it already holds
 * at another path (the same PDF for a second athlete) is copied from here;
 * the rest come from the folder. One the folder does not have yet (the other
 * device's push has not landed, or Drive's listing lags) is left for the next
 * sync, as is one that does not open or is not the content its name says:
 * the server is never handed bytes it would refuse.
 *
 * Runs once the database is final: after a fast-forward's swap, after a
 * rebase's replay. Between the swap and the replay a path may still hold a
 * file this device uploaded offline, which only the replay moves to its row.
 */
export async function pullFiles(
  api: SyncFilesApi,
  remote: SyncRemote,
  key: CryptoKey,
): Promise<{ fetched: number; missing: string[] }> {
  let fetched = 0;
  const missing: string[] = [];
  for (const file of await api.list()) {
    if (file.complete) {
      continue;
    }
    const bytes = file.present
      ? await api.read(file.sha256)
      : await fetchContent(remote, key, file.sha256);
    if (bytes === null) {
      missing.push(file.sha256);
      continue;
    }
    await api.write(file.sha256, bytes);
    fetched++;
  }
  return { fetched, missing };
}

/** The content's bytes from the folder, or null when it is not there or not what its name says. */
async function fetchContent(
  remote: SyncRemote,
  key: CryptoKey,
  sha256: string,
): Promise<Uint8Array | null> {
  const path = filePath(sha256);
  const sealed = await remote.read(path);
  if (sealed === null) {
    return null;
  }
  try {
    const bytes = await open(key, path, sealed);
    return (await sha256Hex(bytes)) === sha256 ? bytes : null;
  } catch (error) {
    if (error instanceof EnvelopeError) {
      return null;
    }
    throw error;
  }
}
