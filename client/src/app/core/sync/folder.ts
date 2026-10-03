import { utf8 } from './bytes';
import { EnvelopeError, openJson, seal } from './envelope';
import { FOLDER_PATH, isDeviceId } from './layout';
import { RemoteFile, SyncRemote } from './remote';

/**
 * `sync/folder.bjs` (protocol § The keys): the folder's id, sealed under the
 * sync key, `{ "v": 1, "folder": "<32 hex>" }`. Before a round, a device checks
 * it against the id the keys file gave it (#2046):
 * - **the same id:** the academy's folder; sync;
 * - **another id, or missing beside versions or reports:** another academy's
 *   folder, or one someone emptied of its id: ask the owner, write nothing;
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

/**
 * Whether this device may sync with the folder: **two devices at most**, the
 * PC and the phone (protocol § Scope). **They are the two whose reports
 * reached Drive first**, on Drive's clock: two new devices that both found
 * room at once both write a report, and the later one is refused from then
 * on, its report there or not (#2106). One with no report joins only beside
 * fewer than two others. A report that does not open still names a device.
 */
export async function hasRoomFor(remote: SyncRemote, device: string): Promise<boolean> {
  const devices = reportingDevices((await remote.list('devices')).files);
  return devices.includes(device) ? devices.indexOf(device) < 2 : devices.length < 2;
}

/**
 * The devices that sync with the folder: the two whose reports reached Drive
 * first. A refused device's report stays in `devices/` and says nothing: it
 * must never hold back clearing the journals of the two (#2106).
 */
export function syncingDevices(files: readonly RemoteFile[]): string[] {
  return reportingDevices(files).slice(0, 2);
}

/** Every device with a report, in the order the reports reached Drive. */
function reportingDevices(files: readonly RemoteFile[]): string[] {
  return files
    .map((file) => ({
      id: /^devices\/([a-z0-9]+)\.bjs$/.exec(file.path)?.[1],
      created: file.created,
    }))
    .filter(
      (report): report is { id: string; created: number } =>
        report.id !== undefined && isDeviceId(report.id),
    )
    .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))
    .map((report) => report.id);
}
