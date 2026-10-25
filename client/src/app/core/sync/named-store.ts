import { isSha256 } from './parse';

/**
 * Where a device keeps what each kept version names between runs (#2118): the
 * page's own storage, beside the ledger (`ledger-store.ts`). A version never
 * changes once written, so what it names is read once, not at every day's
 * pruning of `files/`.
 *
 * It names the device and the folder it belongs to: another folder's versions
 * are other files. Each content is written once and the versions point at it,
 * since every version names nearly the same few hundred.
 *
 * **Anything it cannot read for certain is forgotten whole:** the versions are
 * then read again, which costs time and never a file.
 */
const KEY = 'budojoSyncNamed';

export interface NamedOwner {
  device: string;
  folder?: string;
}

export function loadNamed(
  owner: NamedOwner,
  storage: Storage = localStorage,
): Map<string, string[]> {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) {
      return new Map();
    }
    const saved = JSON.parse(raw) as {
      device?: unknown;
      folder?: unknown;
      contents?: unknown;
      versions?: unknown;
    };
    const { contents, versions } = saved;
    if (
      saved.device !== owner.device ||
      (saved.folder ?? null) !== (owner.folder ?? null) ||
      !Array.isArray(contents) ||
      !contents.every(isSha256) ||
      typeof versions !== 'object' ||
      versions === null
    ) {
      return new Map();
    }
    const named = new Map<string, string[]>();
    for (const [key, indexes] of Object.entries(versions as Record<string, unknown>)) {
      if (
        !Array.isArray(indexes) ||
        !indexes.every((i) => Number.isInteger(i) && i >= 0 && i < contents.length)
      ) {
        return new Map();
      }
      named.set(
        key,
        indexes.map((i: number) => contents[i] as string),
      );
    }
    return named;
  } catch {
    return new Map();
  }
}

export function saveNamed(
  owner: NamedOwner,
  named: ReadonlyMap<string, readonly string[]>,
  storage: Storage = localStorage,
): void {
  const contents: string[] = [];
  const index = new Map<string, number>();
  const versions: Record<string, number[]> = {};
  for (const [key, list] of named) {
    versions[key] = list.map((content) => {
      let at = index.get(content);
      if (at === undefined) {
        at = contents.length;
        contents.push(content);
        index.set(content, at);
      }
      return at;
    });
  }
  try {
    storage.setItem(
      KEY,
      JSON.stringify({ device: owner.device, folder: owner.folder ?? null, contents, versions }),
    );
  } catch {
    // Full or blocked: the next run reads the versions again.
  }
}
