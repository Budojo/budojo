import { randomBytes as nodeRandomBytes } from 'node:crypto';

/**
 * This PC's id in the academy's sync folder (#2032, protocol § The folder): a
 * kind and four random characters, `pc4f2a`. Made once, the first time the PC
 * joins the sync, and kept in its own file under `userData`, beside the data
 * and apart from Drive's state: disconnecting and connecting Drive again must
 * not make it another device, whose old report would then hold nothing for
 * ever and stop every journal from being cleared (protocol § `devices/`).
 */
export const DEVICE_FILE = 'sync-device.json';

const ID = /^pc[0-9a-z]{4}$/;
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newPcDeviceId(randomBytes: (n: number) => Buffer = nodeRandomBytes): string {
  // 36 does not divide 256, so bytes past the last whole multiple are drawn again.
  const limit = 256 - (256 % ALPHABET.length);
  let id = 'pc';
  while (id.length < 6) {
    for (const byte of randomBytes(8)) {
      if (byte < limit && id.length < 6) {
        id += ALPHABET[byte % ALPHABET.length];
      }
    }
  }

  return id;
}

/**
 * What the file holds: the id, and the database's epoch. A restore (Data &
 * backup) puts the database back in time outside the sync, so it moves the
 * epoch on, and the page forgets what it remembered of the database before:
 * the protocol meets the restored one as an academy of its own, which asks
 * (protocol § Scope).
 */
export interface SyncDevice {
  device: string;
  epoch: number;
}

/** The file's contents, or null for none or a file that does not read. */
export function parseDeviceFile(raw: string | null): SyncDevice | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { device?: unknown; epoch?: unknown };
    const { device, epoch } = parsed;
    if (typeof device !== 'string' || !ID.test(device)) {
      return null;
    }

    return { device, epoch: typeof epoch === 'number' && Number.isInteger(epoch) && epoch >= 0 ? epoch : 0 };
  } catch {
    return null;
  }
}

export function serializeDeviceFile(sync: SyncDevice): string {
  return JSON.stringify({ v: 1, device: sync.device, epoch: sync.epoch }, null, 2) + '\n';
}
