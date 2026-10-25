import { EMPTY_LEDGER, SyncLedger } from './engine';
import { isVersionRef } from './layout';

/**
 * Where a device keeps its `SyncLedger` between rounds and launches (#2046):
 * the page's own storage, which the phone's manifest and the desktop's profile
 * keep on the device. It names the device and the database's epoch it belongs
 * to, so a ledger never outlives the identity or the database it was made for.
 *
 * **Forgotten when the database is replaced outside the sync** (protocol §
 * Scope): the base no longer describes it, and an academy with no base asks
 * the owner before it meets the folder's.
 * - **The phone's door** forgets it when it restores a backup.
 * - **The PC's Restore** moves the epoch on in the main process (#2032), so
 *   no round of a page that is about to reload can write it back.
 */
const KEY = 'budojoSyncLedger';

/**
 * Whose ledger: the device, the folder it syncs with, and the epoch of its
 * database (0 where nothing moves it). The folder, because the PC's id
 * outlives a Drive link: joined again to another account's keys, it starts
 * that folder with nothing remembered.
 */
export interface LedgerOwner {
  device: string;
  folder?: string;
  epoch?: number;
}

export function loadLedger(owner: LedgerOwner, storage: Storage = localStorage): SyncLedger {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) {
      return EMPTY_LEDGER;
    }
    const saved = JSON.parse(raw) as {
      device?: unknown;
      folder?: unknown;
      epoch?: unknown;
      ledger?: unknown;
    };
    return saved.device === owner.device &&
      (saved.folder ?? null) === (owner.folder ?? null) &&
      (saved.epoch ?? 0) === (owner.epoch ?? 0) &&
      isLedger(saved.ledger)
      ? saved.ledger
      : EMPTY_LEDGER;
  } catch {
    return EMPTY_LEDGER;
  }
}

export function saveLedger(
  owner: LedgerOwner,
  ledger: SyncLedger,
  storage: Storage = localStorage,
): void {
  storage.setItem(
    KEY,
    JSON.stringify({
      device: owner.device,
      folder: owner.folder ?? null,
      epoch: owner.epoch ?? 0,
      ledger,
    }),
  );
}

/**
 * Whose ledger the storage holds, whatever identity asks: what a device
 * opened with no network counts its waiting writes against, before it could
 * read who it is.
 */
export function savedOwner(storage: Storage = localStorage): LedgerOwner | null {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) {
      return null;
    }
    const saved = JSON.parse(raw) as { device?: unknown; folder?: unknown; epoch?: unknown };
    if (typeof saved.device !== 'string') {
      return null;
    }
    return {
      device: saved.device,
      ...(typeof saved.folder === 'string' ? { folder: saved.folder } : {}),
      ...(typeof saved.epoch === 'number' ? { epoch: saved.epoch } : {}),
    };
  } catch {
    return null;
  }
}

export function forgetLedger(storage: Storage = localStorage): void {
  storage.removeItem(KEY);
}

function isLedger(value: unknown): value is SyncLedger {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const ledger = value as Record<string, unknown>;
  const entryId = (id: unknown) => id === null || typeof id === 'string';
  const unconfirmed = ledger['unconfirmed'] as Record<string, unknown> | null | undefined;
  const prunedAt = ledger['contentsPrunedAt'];
  return (
    (ledger['base'] === null || isVersionRef(ledger['base'])) &&
    entryId(ledger['pushedThrough']) &&
    entryId(ledger['listedThrough']) &&
    (prunedAt === undefined || typeof prunedAt === 'number') &&
    (unconfirmed === null ||
      (typeof unconfirmed === 'object' &&
        unconfirmed !== undefined &&
        isVersionRef(unconfirmed['version']) &&
        (unconfirmed['parent'] === null || isVersionRef(unconfirmed['parent'])) &&
        (unconfirmed['pushedAt'] === null || typeof unconfirmed['pushedAt'] === 'number')))
  );
}
