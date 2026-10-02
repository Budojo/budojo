import { utf8 } from './bytes';
import { EnvelopeError, openJson, seal } from './envelope';
import { FOLDER_PATH } from './layout';
import { SyncRemote } from './remote';

/**
 * `sync/folder.bjs` (protocol § The keys): the folder's id, sealed under the
 * sync key, `{ "v": 1, "folder": "<32 hex>" }`. Before a round, a device checks
 * it against the id the keys file gave it (#2046):
 * - **the same id:** the academy's folder; sync;
 * - **missing, or another id:** another academy's folder, or one someone
 *   emptied: ask the owner, write nothing;
 * - **does not open under the sync key:** the key rotated after this device was
 *   unpaired: stop, write nothing, so its deleted report stays deleted.
 *
 * **A folder with nothing in it** is a new one: the first device to sync
 * writes `folder.bjs` (protocol § `devices/`: "together with its report,
 * before version 1"). Both devices writing it at once write the same id.
 */
export type FolderCheck = 'ours' | 'another' | 'unpaired';

export async function checkFolder(
  remote: SyncRemote,
  key: CryptoKey,
  folder: string,
): Promise<FolderCheck> {
  const sealed = await remote.read(FOLDER_PATH);
  if (sealed === null) {
    const [versions, devices] = await Promise.all([
      remote.list('versions'),
      remote.list('devices'),
    ]);
    if (versions.files.length > 0 || devices.files.length > 0) {
      return 'another';
    }
    await remote.write(FOLDER_PATH, await sealFolder(key, folder));
    return 'ours';
  }
  let value: unknown;
  try {
    value = await openJson(key, FOLDER_PATH, sealed);
  } catch (error) {
    if (error instanceof EnvelopeError && error.reason === 'wrong-key-or-path') {
      return 'unpaired';
    }
    return 'another';
  }
  const named = (value as { v?: unknown; folder?: unknown } | null)?.folder;
  return named === folder ? 'ours' : 'another';
}

export function sealFolder(key: CryptoKey, folder: string): Promise<Uint8Array> {
  return seal(key, FOLDER_PATH, utf8(JSON.stringify({ v: 1, folder })));
}
