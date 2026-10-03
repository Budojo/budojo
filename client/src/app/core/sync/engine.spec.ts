import { describe, expect, it } from 'vitest';
import { utf8 } from './bytes';
import {
  AskChoice,
  EMPTY_LEDGER,
  PRUNED_PER_PUSH,
  resolveAsk,
  SyncContext,
  syncOnce,
} from './engine';
import { importSyncKey, newSyncKey, seal } from './envelope';
import { devicePath, filePath } from './layout';
import { MemoryRemote, SyncRemote } from './remote';
import { MemoryDevice as Device } from './testing/memory-device';

/**
 * The sync engine (#2046, PRD § 5.2): two devices of one academy, a PC and a
 * phone, each with its own server (`testing/memory-device.ts`), meeting in one
 * folder in memory.
 */

const MINUTE = 60_000;

async function folder(clock?: () => number): Promise<{ remote: MemoryRemote; key: CryptoKey }> {
  return { remote: new MemoryRemote(clock), key: await importSyncKey(newSyncKey()) };
}

function sync(
  device: Device,
  remote: SyncRemote,
  key: CryptoKey,
  holdWrites = async <T>(work: () => Promise<T>): Promise<T> => {
    device.holding = true;
    try {
      return await work();
    } finally {
      device.holding = false;
    }
  },
  swapIn: () => Promise<void> = async () => device.swapIn(),
) {
  const context: SyncContext = {
    device: device.id,
    app: '2.76.0',
    key,
    remote,
    server: device,
    shell: { swapIn },
    ledger: device.ledger,
    saveLedger: (ledger) => {
      device.ledger = ledger;
    },
    holdWrites,
    now: () => Date.parse('2026-10-02T18:00:00Z'),
  };
  return syncOnce(context);
}

/** The owner's answer to `ask`, on the device that asked. */
function resolve(
  device: Device,
  remote: SyncRemote,
  key: CryptoKey,
  choice: AskChoice,
  seen: { seq: number; device: string },
) {
  const context: SyncContext = {
    device: device.id,
    app: '2.77.0',
    key,
    remote,
    server: device,
    shell: { swapIn: async () => device.swapIn() },
    ledger: device.ledger,
    saveLedger: (ledger) => {
      device.ledger = ledger;
    },
    holdWrites: async (work) => work(),
    now: () => Date.parse('2026-10-03T09:00:00Z'),
  };
  return resolveAsk(context, choice, seen);
}

async function outcome(device: Device, remote: SyncRemote, key: CryptoKey) {
  return (await sync(device, remote, key)).outcome;
}

/** A remote whose listing hides some files, as Drive's lags behind a new one. */
function lagging(remote: MemoryRemote, hides: (path: string) => boolean): SyncRemote {
  return {
    list: async (dir) => {
      const listing = await remote.list(dir);
      return { ...listing, files: listing.files.filter((file) => !hides(file.path)) };
    },
    read: (path) => remote.read(path),
    write: (path, bytes) => remote.write(path, bytes),
    remove: (path) => remote.remove(path),
  };
}

/** A PC with its academy at version 1, and a phone that pulled it. */
async function twoDevices() {
  const { remote, key } = await folder();
  const pc = new Device('pc4f2a', 'Eagles BJJ');
  await sync(pc, remote, key);
  const phone = new Device('phone9c1e', null);
  await sync(phone, remote, key);
  return { remote, key, pc, phone };
}

describe('the sync engine (#2046)', () => {
  it('publishes an academy that never synced as version 1, and says what it holds', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');

    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 1, device: 'pc4f2a' },
    });

    expect([...remote.files.keys()].sort()).toEqual([
      'devices/pc4f2a.bjs',
      'versions/000001-pc4f2a.root.bjs',
    ]);
    expect(pc.ledger.base).toEqual({ seq: 1, device: 'pc4f2a' });
  });

  it("brings that version to a phone that holds nothing: the PC's academy, swapped in", async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    pc.write('Luca on 1 Oct');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'pulled',
      version: { seq: 1, device: 'pc4f2a' },
    });

    expect(phone.db.rows).toEqual(pc.db.rows);
    expect(phone.ledger.base).toEqual({ seq: 1, device: 'pc4f2a' });
  });

  it('carries what the phone marks at the gym to the PC, which pulls it by itself', async () => {
    const { remote, key, pc, phone } = await twoDevices();

    phone.write('Giulia on 2 Oct');
    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 2, device: 'phone9c1e' },
    });
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'pulled',
      version: { seq: 2, device: 'phone9c1e' },
    });

    expect(pc.db.rows).toEqual(['Giulia on 2 Oct']);
  });

  it("keeps the phone's write until the PC reports holding it, then clears it", async () => {
    const { remote, key, pc, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');

    await sync(phone, remote, key);
    expect(await phone.journal()).toHaveLength(1);

    await sync(pc, remote, key);
    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(await phone.journal()).toEqual([]);
    expect(phone.ledger.unconfirmed).toBeNull();
  });

  it('asks the owner when a phone with an academy of its own meets a folder with one, and still reports', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', 'Prova');

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'pc4f2a' },
    });
    expect(phone.db.academy).toBe('Prova');
    expect(remote.files.has(devicePath('phone9c1e'))).toBe(true);
  });

  it('never fast-forwards over writes of its own: both changed, so it replays them on the other version', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.write('Giulia on 2 Oct');
    phone.under.length = 0;

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 2, device: 'pc4f2a' },
      pushed: { seq: 3, device: 'phone9c1e' },
    });
    expect(phone.under).toEqual(['stage rebase held', 'swap held']);
    expect(phone.db.rows).toEqual(['Luca on 2 Oct', 'Giulia on 2 Oct']);
    expect([...remote.files.keys()]).toContain('versions/000003-phone9c1e.000002-pc4f2a.bjs');
  });

  it("waits for its own push while Drive's listing has not caught up", async () => {
    const { remote, key, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);

    expect(
      await outcome(
        phone,
        lagging(remote, (path) => path.includes('phone9c1e.000001')),
        key,
      ),
    ).toEqual({
      kind: 'wait',
    });
  });
});

describe('a write the round must not lose (#2086 review)', () => {
  it('swaps nothing when a check-in lands while the version downloads: the round decides again', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    // The owner marks a presence while the phone is still reading the version.
    const reading: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: async (path) => {
        if (path.startsWith('versions/')) {
          phone.write('Giulia on 2 Oct');
        }
        return remote.read(path);
      },
      write: (path, bytes) => remote.write(path, bytes),
      remove: (path) => remote.remove(path),
    };

    expect((await sync(phone, reading, key)).outcome).toEqual({ kind: 'retry' });
    expect(phone.db.rows).toEqual(['Giulia on 2 Oct']);
    expect(await phone.journal()).toHaveLength(1);
    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 2, device: 'pc4f2a' },
      pushed: { seq: 3, device: 'phone9c1e' },
    });
    expect(phone.db.rows).toEqual(['Luca on 2 Oct', 'Giulia on 2 Oct']);
  });

  it("stages and swaps only while the page's writes are held", async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.under.length = 0;

    await sync(phone, remote, key);

    expect(phone.under).toEqual(['stage held', 'swap held']);
    expect(phone.db.rows).toEqual(['Luca on 2 Oct']);
  });

  it('knows its new base once staged: a phone killed during the restart wakes up as that version', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);

    await expect(
      sync(phone, remote, key, undefined, async () => {
        throw new Error('killed during the restart');
      }),
    ).rejects.toThrow('killed');

    expect(phone.ledger.base).toEqual({ seq: 2, device: 'pc4f2a' });
  });

  it('takes a push whose answer was lost as pushed: once listed, it is the base, and nothing is sent twice', async () => {
    const { remote, key, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');
    let writes = 0;
    const lostAnswer: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        await remote.write(path, bytes);
        if (path.startsWith('versions/')) {
          writes++;
          throw new Error('the connection dropped before the answer');
        }
      },
      remove: (path) => remote.remove(path),
    };

    await expect(sync(phone, lostAnswer, key)).rejects.toThrow('dropped');
    expect(phone.ledger.unconfirmed?.version).toEqual({ seq: 2, device: 'phone9c1e' });

    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(phone.ledger.base).toEqual({ seq: 2, device: 'phone9c1e' });
    expect(writes).toBe(1);
  });

  it('counts the wait for its push from the first listing after it, not from before a long upload', async () => {
    let now = 1_000_000;
    const { remote, key } = await folder(() => now);
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);
    await sync(phone, remote, key);
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);

    // Eleven minutes on, a listing that still lacks it: the first since the push.
    now += 11 * MINUTE;
    expect(
      await outcome(
        phone,
        lagging(remote, (path) => path.includes('phone9c1e.000001')),
        key,
      ),
    ).toEqual({
      kind: 'wait',
    });
  });
});

describe('what the round reads and fetches (#2086 review)', () => {
  it('takes a report for the device its path names, or as holding nothing: never clears on a mislabelled one', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);
    await sync(pc, remote, key);
    // The PC's file now speaks for another device.
    const path = devicePath('pc4f2a');
    const forged = {
      v: 1,
      device: 'tablet1a2b',
      base: null,
      holds: await pc.holds(),
      at: '2026-10-02T18:00:00Z',
    };
    await remote.write(path, await seal(key, path, utf8(JSON.stringify(forged))));

    await sync(phone, remote, key);

    expect(await phone.journal()).toHaveLength(1);
  });

  it('fetches a file the folder did not have yet at a later round', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    const sha = await pc.photo('a photo');
    await sync(pc, remote, key);
    const sealed = await remote.read(filePath(sha));
    await remote.remove(filePath(sha));
    const phone = new Device('phone9c1e', null);

    expect((await sync(phone, remote, key)).missingFiles).toBe(1);

    await remote.write(filePath(sha), sealed as Uint8Array);
    expect(await sync(phone, remote, key)).toEqual({
      outcome: { kind: 'nothing' },
      missingFiles: 0,
    });
    expect(phone.held.has(sha)).toBe(true);
  });

  it('clears no entry of a push that never reached Drive, and publishes it again after the lag', async () => {
    let now = 1_000_000;
    const { remote, key } = await folder(() => now);
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    pc.write('Luca on 2 Oct');
    const unreachable: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        if (path.startsWith('versions/')) {
          throw new Error('no network');
        }
        await remote.write(path, bytes);
      },
      remove: (path) => remote.remove(path),
    };

    await expect(sync(pc, unreachable, key)).rejects.toThrow('no network');
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'wait' });
    expect(await pc.journal()).toHaveLength(1);

    now += 11 * MINUTE;
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 2, device: 'pc4f2a' },
    });
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'nothing' });
    expect(await pc.journal()).toEqual([]);
  });

  it('asks, after the lag, when its version 1 never landed and another device published an academy meanwhile', async () => {
    let now = 1_000_000;
    const { remote, key } = await folder(() => now);
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    const unreachable: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        if (path.startsWith('versions/')) {
          throw new Error('no network');
        }
        await remote.write(path, bytes);
      },
      remove: (path) => remote.remove(path),
    };
    await expect(sync(pc, unreachable, key)).rejects.toThrow('no network');

    const phone = new Device('phone9c1e', 'Tigers BJJ');
    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 1, device: 'phone9c1e' },
    });
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'wait' });

    now += 11 * MINUTE;
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'phone9c1e' },
    });
    expect(pc.db.academy).toBe('Eagles BJJ');
  });

  it('asks, and keeps its academy, when its version 1 lands after another academy’s', async () => {
    let now = 1_000_000;
    const { remote, key } = await folder(() => now);
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    const phone = new Device('phone9c1e', 'Tigers BJJ');
    // The phone publishes its own academy while the PC's upload is under way.
    const slow: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        if (path.startsWith('versions/')) {
          await sync(phone, remote, key);
          now += 1_000;
        }
        await remote.write(path, bytes);
      },
      remove: (path) => remote.remove(path),
    };
    expect(await outcome(pc, slow, key)).toEqual({
      kind: 'pushed',
      version: { seq: 1, device: 'pc4f2a' },
    });

    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'phone9c1e' },
    });
    expect(pc.db.academy).toBe('Eagles BJJ');
    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(phone.db.academy).toBe('Tigers BJJ');
  });

  it('asks, after the lag, when a push on its own version 1 never landed and another academy’s is there', async () => {
    let now = 1_000_000;
    const { remote, key } = await folder(() => now);
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    const phone = new Device('phone9c1e', 'Tigers BJJ');
    const slow: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        if (path.startsWith('versions/')) {
          await sync(phone, remote, key);
          now += 1_000;
        }
        await remote.write(path, bytes);
      },
      remove: (path) => remote.remove(path),
    };
    await sync(pc, slow, key);

    // Drive does not list the phone's version 1 yet, and the PC's next upload fails.
    pc.write('Giulia on 2 Oct');
    const behind = lagging(remote, (path) => path.includes('000001-phone9c1e'));
    const unreachable: SyncRemote = {
      ...behind,
      write: async (path, bytes) => {
        if (path.startsWith('versions/')) {
          throw new Error('no network');
        }
        await remote.write(path, bytes);
      },
    };
    await expect(sync(pc, unreachable, key)).rejects.toThrow('no network');
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'wait' });

    now += 11 * MINUTE;
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'phone9c1e' },
    });
    expect(pc.db.academy).toBe('Eagles BJJ');
    expect(await pc.journal()).toHaveLength(1);
  });

  it('waits for a push that carried no entry while Drive has not listed it: no second version over it', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);

    // Version 1 holds the academy and no entry; the listing lags behind it.
    expect(
      await outcome(
        pc,
        lagging(remote, (path) => path.includes('000001-pc4f2a')),
        key,
      ),
    ).toEqual({
      kind: 'wait',
    });
    expect([...remote.files.keys()].filter((path) => path.startsWith('versions/'))).toEqual([
      'versions/000001-pc4f2a.root.bjs',
    ]);
  });
});

describe('the owner’s choice when a round asks (#2033, PRD § 6.5)', () => {
  /** The PC publishes its academy; a phone that restored a backup of its own meets it and asks. */
  async function twoAcademies() {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', 'Eagles BJJ, from a backup');
    phone.write('Luca on 2 Oct, before the phone joined the sync');
    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'pc4f2a' },
    });
    return { remote, key, pc, phone };
  }

  it('takes the folder’s academy: the phone becomes the PC’s, and the next round has nothing to do', async () => {
    const { remote, key, phone } = await twoAcademies();

    const round = await resolve(phone, remote, key, 'folder', { seq: 1, device: 'pc4f2a' });

    expect(round.outcome).toEqual({ kind: 'pulled', version: { seq: 1, device: 'pc4f2a' } });
    expect(phone.db.academy).toBe('Eagles BJJ');
    expect(await phone.journal()).toEqual([]);
    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
  });

  it('keeps this device’s academy as a line of its own: the other device asks in its turn, never merges', async () => {
    const { remote, key, pc, phone } = await twoAcademies();
    // The PC wrote meanwhile: its write must never be replayed into the phone's gym.
    pc.write('Giulia on 3 Oct');
    await sync(pc, remote, key);

    const round = await resolve(phone, remote, key, 'device', { seq: 2, device: 'pc4f2a' });

    expect(round.outcome).toEqual({ kind: 'pushed', version: { seq: 3, device: 'phone9c1e' } });
    expect([...remote.files.keys()]).toContain('versions/000003-phone9c1e.root.bjs');
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 3, device: 'phone9c1e' },
    });
    expect(pc.db.academy).toBe('Eagles BJJ');

    // The owner takes the phone's on the PC too: it pulls, its own gym gives way.
    const taken = await resolve(pc, remote, key, 'folder', { seq: 3, device: 'phone9c1e' });
    expect(taken.outcome).toEqual({ kind: 'pulled', version: { seq: 3, device: 'phone9c1e' } });
    expect(pc.db.academy).toBe('Eagles BJJ, from a backup');
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'nothing' });
    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
  });

  it('does nothing when the folder moved since the owner was asked, and asks again on what is there', async () => {
    const { remote, key, pc, phone } = await twoAcademies();
    pc.write('Giulia on 3 Oct');
    await sync(pc, remote, key);

    const round = await resolve(phone, remote, key, 'folder', { seq: 1, device: 'pc4f2a' });

    expect(round.outcome).toEqual({ kind: 'ask', latest: { seq: 2, device: 'pc4f2a' } });
    expect(phone.db.academy).toBe('Eagles BJJ, from a backup');
  });
});

describe('the versions the folder keeps (#2030)', () => {
  const versionsOf = (remote: MemoryRemote) =>
    [...remote.files.keys()].filter((path) => path.startsWith('versions/')).length;

  it('keeps the newest ten and the first version after each push: every version is the whole database', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    for (let night = 1; night <= 12; night++) {
      pc.write(`Luca, night ${night}`);
      await sync(pc, remote, key);
    }

    expect(versionsOf(remote)).toBe(11);
    expect(remote.files.has('versions/000013-pc4f2a.000012-pc4f2a.bjs')).toBe(true);
    expect(remote.files.has('versions/000002-pc4f2a.000001-pc4f2a.bjs')).toBe(false);
    expect(remote.files.has('versions/000001-pc4f2a.root.bjs')).toBe(true);
  });

  it('prunes only after a push of its own: a pull deletes nothing', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    // The PC's pushes keep every version, as a PC of before #2030 does.
    const keepsAll: SyncRemote = {
      ...remote,
      list: (path) => remote.list(path),
      read: (path) => remote.read(path),
      write: (path, bytes) => remote.write(path, bytes),
      remove: async (path) => {
        if (!path.startsWith('versions/')) await remote.remove(path);
      },
    };
    for (let night = 1; night <= 12; night++) {
      pc.write(`Luca, night ${night}`);
      await sync(pc, keepsAll, key);
    }
    expect(versionsOf(remote)).toBe(13);

    expect(await outcome(phone, remote, key)).toMatchObject({ kind: 'pulled' });
    expect(versionsOf(remote)).toBe(13);
  });

  it('asks, never rebases, when the phone chose its own academy and pushed ten more on it (#2117 review)', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);
    await sync(phone, remote, key);
    for (let night = 1; night <= 12; night++) {
      pc.write(`Luca, night ${night}`);
      await sync(pc, remote, key);
    }
    await sync(phone, remote, key);
    await sync(pc, remote, key);
    // The phone restores a backup of another academy, and the owner keeps it there.
    phone.ledger = EMPTY_LEDGER;
    phone.db = {
      academy: 'Eagles BJJ, from a backup',
      rows: [],
      dealt: {},
      journal: [],
      names: [],
    };
    const asked = (await sync(phone, remote, key)).outcome;
    expect(asked.kind).toBe('ask');
    await resolve(
      phone,
      remote,
      key,
      'device',
      (asked as { latest: { seq: number; device: string } }).latest,
    );
    for (let night = 1; night <= 10; night++) {
      phone.write(`Giulia, night ${night}`);
      await sync(phone, remote, key);
    }

    pc.write('Marco, offline on the PC');
    expect((await sync(pc, remote, key)).outcome.kind).toBe('ask');
    expect(pc.db.academy).toBe('Eagles BJJ');
  });

  it('prunes again once both devices are on one academy: the line the owner left goes', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', 'Eagles BJJ, from a backup');
    phone.write('Luca');
    const asked = (await sync(phone, remote, key)).outcome as {
      latest: { seq: number; device: string };
    };
    await resolve(phone, remote, key, 'device', asked.latest);
    const pcAsked = (await sync(pc, remote, key)).outcome as {
      kind: string;
      latest: { seq: number; device: string };
    };
    expect(pcAsked.kind).toBe('ask');
    await resolve(pc, remote, key, 'folder', pcAsked.latest);
    for (let night = 1; night <= 30; night++) {
      phone.write(`Giulia, night ${night}`);
      await sync(phone, remote, key);
      await sync(pc, remote, key);
    }

    // The newest ten, and the first version of the line both are on.
    expect(versionsOf(remote)).toBe(11);
    expect(remote.files.has('versions/000001-pc4f2a.root.bjs')).toBe(false);
  });

  it('trims a folder that grew before the retention a few versions a push, the oldest first', async () => {
    const { remote, key, pc } = await twoDevices();
    const keepsAll: SyncRemote = {
      list: (path) => remote.list(path),
      read: (path) => remote.read(path),
      write: (path, bytes) => remote.write(path, bytes),
      remove: async (path) => {
        if (!path.startsWith('versions/')) await remote.remove(path);
      },
    };
    for (let night = 1; night <= 40; night++) {
      pc.write(`Luca, night ${night}`);
      await sync(pc, keepsAll, key);
    }
    expect(versionsOf(remote)).toBe(41);

    pc.write('Luca, the night the retention shipped');
    await sync(pc, remote, key);

    expect(versionsOf(remote)).toBe(42 - PRUNED_PER_PUSH);
    expect(remote.files.has('versions/000002-pc4f2a.000001-pc4f2a.bjs')).toBe(false);
    expect(remote.files.has('versions/000030-pc4f2a.000029-pc4f2a.bjs')).toBe(true);
  });

  it('never fails a round on a version it could not delete: the next push tries again', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    const stubborn: SyncRemote = {
      list: (path) => remote.list(path),
      read: (path) => remote.read(path),
      write: (path, bytes) => remote.write(path, bytes),
      remove: async (path) => {
        if (path.startsWith('versions/')) {
          throw new Error('Drive said no');
        }
        await remote.remove(path);
      },
    };
    await sync(pc, stubborn, key);
    for (let night = 1; night <= 11; night++) {
      pc.write(`Luca, night ${night}`);
      expect(await outcome(pc, stubborn, key)).toMatchObject({ kind: 'pushed' });
    }

    expect(versionsOf(remote)).toBe(12);
  });
});

describe('a refused device (#2106)', () => {
  it('never holds back clearing the journal: a third device’s report speaks for nobody', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    // A third phone joined beside them in a race, and its report holds nothing.
    await remote.write(
      devicePath('phone7k2m'),
      await seal(
        key,
        devicePath('phone7k2m'),
        utf8(
          JSON.stringify({
            device: 'phone7k2m',
            base: null,
            holds: {},
            at: '2026-10-02T18:00:00Z',
          }),
        ),
      ),
    );
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    await sync(phone, remote, key);

    await sync(pc, remote, key);

    expect(await pc.journal()).toEqual([]);
  });
});

describe('the rebase (#2031 step 3)', () => {
  it('brings both devices to the same academy: the PC pulls what the phone replayed, and the phone clears its journal', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);

    // The PC still keeps its own entry, so it rebases too, never
    // fast-forwards: its replay finds the entry in the phone's version.
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 3, device: 'phone9c1e' },
      pushed: null,
    });
    expect(pc.db.rows).toEqual(['Luca on 2 Oct', 'Giulia on 2 Oct']);

    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(await phone.journal()).toEqual([]);
  });

  it('keeps and pushes a presence both devices marked: already true there, so it is applied once', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.write('Luca on 2 Oct');
    const [mine] = await phone.journal();

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 2, device: 'pc4f2a' },
      pushed: { seq: 3, device: 'phone9c1e' },
    });
    expect(phone.replayed).toEqual({ [mine.id]: 'already' });
    expect(phone.db.rows).toEqual(['Luca on 2 Oct']);
    // Pushed, so the PC holds it once it pulls, and the phone may clear it.
    await sync(pc, remote, key);
    expect((await pc.holds())['phone9c1e']).toBe(mine.id);
    await sync(phone, remote, key);
    expect(await phone.journal()).toEqual([]);
  });

  it('pushes nothing when the version holds every write it carries already', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);
    await sync(pc, remote, key);
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    // The phone still keeps its entry: it has not seen the PC's report yet.
    const [mine] = await phone.journal();

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 3, device: 'pc4f2a' },
      pushed: null,
    });
    expect(phone.replayed).toEqual({ [mine.id]: 'skipped' });
    expect(phone.db.rows).toEqual(['Giulia on 2 Oct', 'Luca on 2 Oct']);
    expect(await phone.journal()).toEqual([]);
    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
  });

  it('pushes what the replay kept at its next round when the phone is killed after the swap', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.write('Giulia on 2 Oct');

    await expect(
      sync(phone, remote, key, undefined, async () => {
        phone.swapIn();
        throw new Error('killed during the restart');
      }),
    ).rejects.toThrow('killed');
    expect(phone.ledger.base).toEqual({ seq: 2, device: 'pc4f2a' });
    expect(phone.db.rows).toEqual(['Luca on 2 Oct', 'Giulia on 2 Oct']);

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 3, device: 'phone9c1e' },
    });
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 3, device: 'phone9c1e' },
      pushed: null,
    });
    expect(pc.db.rows).toEqual(['Luca on 2 Oct', 'Giulia on 2 Oct']);
  });

  it('settles two pushes of one number: the one Drive listed second rebases onto the first, and both converge', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    phone.write('Giulia on 2 Oct');
    await sync(pc, remote, key);
    // The phone does not see the PC's version yet, and pushes its own 2.
    await sync(
      phone,
      lagging(remote, (path) => path.includes('000002-pc4f2a')),
      key,
    );

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 2, device: 'pc4f2a' },
      pushed: { seq: 3, device: 'phone9c1e' },
    });
    // The PC's own write is in the phone's version: its replay skips it.
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'rebased',
      onto: { seq: 3, device: 'phone9c1e' },
      pushed: null,
    });
    expect(pc.db.rows).toEqual(['Luca on 2 Oct', 'Giulia on 2 Oct']);
    expect(phone.db.rows).toEqual(['Luca on 2 Oct', 'Giulia on 2 Oct']);
    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'nothing' });
  });
});
