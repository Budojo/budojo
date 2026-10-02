import { EMPTY_LEDGER, SyncLedger } from './engine';
import { isVersionRef } from './layout';

/**
 * Where a device keeps its `SyncLedger` between rounds and launches (#2046):
 * the page's own storage, which the phone's manifest and the desktop's profile
 * keep on the device. It names the device it belongs to, so a ledger never
 * outlives the identity it was made under.
 *
 * **Forgotten when the database is replaced outside the sync** (the door's
 * restore, the desktop's Restore): the base no longer describes it, and an
 * academy with no base asks the owner before it meets the folder's
 * (protocol § Scope).
 */
const KEY = 'budojoSyncLedger';

export function loadLedger(device: string, storage: Storage = localStorage): SyncLedger {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) {
      return EMPTY_LEDGER;
    }
    const saved = JSON.parse(raw) as { device?: unknown; ledger?: unknown };
    return saved.device === device && isLedger(saved.ledger) ? saved.ledger : EMPTY_LEDGER;
  } catch {
    return EMPTY_LEDGER;
  }
}

export function saveLedger(
  device: string,
  ledger: SyncLedger,
  storage: Storage = localStorage,
): void {
  storage.setItem(KEY, JSON.stringify({ device, ledger }));
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
  return (
    (ledger['base'] === null || isVersionRef(ledger['base'])) &&
    entryId(ledger['pushedThrough']) &&
    entryId(ledger['listedThrough']) &&
    (unconfirmed === null ||
      (typeof unconfirmed === 'object' &&
        unconfirmed !== undefined &&
        isVersionRef(unconfirmed['version']) &&
        (unconfirmed['parent'] === null || isVersionRef(unconfirmed['parent'])) &&
        (unconfirmed['pushedAt'] === null || typeof unconfirmed['pushedAt'] === 'number')))
  );
}
