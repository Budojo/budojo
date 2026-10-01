import {
  decide,
  Decision,
  latestVersion,
  LocalState,
  SeenVersion,
  settled,
  SETTLE_MS,
  versionsIn,
} from './decide';
import { VersionRef } from './layout';

/**
 * Every row of the decision table (#2029, PRD § 5.2), each named as the owner
 * would meet it. The races, the lagging listings and the pruned folders come
 * from the three reviews of #2061: each was a way a write could have been
 * dropped without anyone knowing. The replay is idempotent by entry id (#2031),
 * so a rebase that finds nothing to carry costs nothing; what must never happen
 * is a fast-forward over writes the latest version lacks.
 */
const PC = 'pc4f2a';
const PHONE = 'phone9c1e';
const NOW = 10_000_000;
const ref = (seq: number, device = PC): VersionRef => ({ seq, device });
/** A version on top of `parent` (the PC's previous one by default), created at `seq` seconds unless told otherwise. */
const v = (
  seq: number,
  device = PC,
  parent: VersionRef | null = seq > 1 ? ref(seq - 1) : null,
  created = seq * 1000,
): SeenVersion => ({ seq, device, parent, created });
const local = (
  base: VersionRef | null,
  flags: Partial<Omit<LocalState, 'base'>> = {},
): LocalState => ({
  base,
  unpushed: false,
  unconfirmed: null,
  ...flags,
});
const pushed = (version: VersionRef, pushedAt = 1_000): LocalState['unconfirmed'] => ({
  version,
  pushedAt,
});

const rows: {
  name: string;
  local: LocalState;
  folder: SeenVersion[];
  now?: number;
  expected: Decision;
}[] = [
  {
    name: 'a device with nothing, and an empty folder: nothing to do',
    local: local(null),
    folder: [],
    expected: { kind: 'nothing' },
  },
  {
    name: 'the first device of an academy publishes version 1',
    local: local(null, { unpushed: true }),
    folder: [],
    expected: { kind: 'push', seq: 1, parent: null },
  },
  {
    name: 'a newly paired device pulls the latest',
    local: local(null),
    folder: [v(1), v(2)],
    expected: { kind: 'fast-forward', to: ref(2) },
  },
  {
    name: 'a device with an academy of its own meets a folder with another: the owner chooses',
    local: local(null, { unpushed: true }),
    folder: [v(3)],
    expected: { kind: 'ask', latest: ref(3) },
  },
  {
    name: 'up to date, nothing done: nothing to do',
    local: local(ref(42)),
    folder: [v(41), v(42)],
    expected: { kind: 'nothing' },
  },
  {
    name: 'up to date, with changes: push the next version on top of it',
    local: local(ref(42), { unpushed: true }),
    folder: [v(41), v(42)],
    expected: { kind: 'push', seq: 43, parent: ref(42) },
  },
  {
    name: 'its own push is the latest: nothing to do while it settles',
    local: local(ref(44), { unconfirmed: pushed(ref(44)) }),
    folder: [v(43), v(44)],
    expected: { kind: 'nothing' },
  },
  {
    name: 'behind, nothing of its own to carry: fast-forward',
    local: local(ref(42)),
    folder: [v(42), v(43, PHONE, ref(42))],
    expected: { kind: 'fast-forward', to: ref(43, PHONE) },
  },
  {
    name: 'behind, with changes: rebase onto the latest',
    local: local(ref(42), { unpushed: true }),
    folder: [v(42), v(43, PHONE, ref(42))],
    expected: { kind: 'rebase', onto: ref(43, PHONE) },
  },
  {
    name: 'behind its own unconfirmed push: rebase, which finds the writes already there and only adopts it',
    local: local(ref(44), { unconfirmed: pushed(ref(44)) }),
    folder: [v(44), v(45, PHONE, ref(44))],
    expected: { kind: 'rebase', onto: ref(45, PHONE) },
  },
  {
    name: 'its twin reached Drive first: rebase onto it',
    local: local(ref(44), { unconfirmed: pushed(ref(44)) }),
    folder: [v(43), v(44, PHONE, ref(43), 44_000), v(44, PC, ref(43), 44_500)],
    expected: { kind: 'rebase', onto: ref(44, PHONE) },
  },
  {
    name: 'it reached Drive first, whatever its device id: it does nothing, the twin rebases',
    local: local(ref(44, PHONE), { unconfirmed: pushed(ref(44, PHONE)) }),
    folder: [v(43), v(44, PC, ref(43), 44_500), v(44, PHONE, ref(43), 44_000)],
    expected: { kind: 'nothing' },
  },
  {
    name: 'the other device built on its own twin: rebase, never a fast-forward',
    local: local(ref(44), { unconfirmed: pushed(ref(44)) }),
    folder: [
      v(43),
      v(44, PC, ref(43), 44_000),
      v(44, PHONE, ref(43), 44_500),
      v(45, PHONE, ref(44, PHONE)),
    ],
    expected: { kind: 'rebase', onto: ref(45, PHONE) },
  },
  {
    name: 'its push pruned while it was away, seven versions on: still a rebase, never a fast-forward',
    local: local(ref(44), { unconfirmed: pushed(ref(44)), unpushed: false }),
    folder: [v(51, PHONE, ref(50, PHONE)), v(52, PHONE, ref(51, PHONE))],
    now: NOW,
    expected: { kind: 'rebase', onto: ref(52, PHONE) },
  },
  {
    name: 'its push is not listed yet, a moment after it landed: wait, do not ask',
    local: local(ref(44), { unconfirmed: pushed(ref(44), NOW - 5_000) }),
    folder: [v(42), v(43)],
    now: NOW,
    expected: { kind: 'wait' },
  },
  {
    name: 'its push is still not listed after the settle time: carry its writes onto what is there',
    local: local(ref(44), { unconfirmed: pushed(ref(44), NOW - SETTLE_MS) }),
    folder: [v(42), v(43)],
    now: NOW,
    expected: { kind: 'rebase', onto: ref(43) },
  },
  {
    name: 'back after weeks, all its writes long confirmed: a fast-forward, nobody is asked',
    local: local(ref(30)),
    folder: [v(44), v(45)],
    expected: { kind: 'fast-forward', to: ref(45) },
  },
  {
    name: 'it had pulled another device’s losing twin, and has nothing of its own: fast-forward',
    local: local(ref(44, PHONE)),
    folder: [v(44, PC, ref(43), 44_000), v(44, PHONE, ref(43), 44_500), v(45)],
    expected: { kind: 'fast-forward', to: ref(45) },
  },
  {
    name: 'the folder is behind this device: versions were deleted, so the owner chooses',
    local: local(ref(45, PHONE)),
    folder: [v(43)],
    expected: { kind: 'ask', latest: ref(43) },
  },
  {
    name: 'the folder was emptied: publish again on top of what this device has',
    local: local(ref(42)),
    folder: [],
    expected: { kind: 'push', seq: 43, parent: ref(42) },
  },
];

describe('decide (#2029)', () => {
  for (const row of rows) {
    it(row.name, () => {
      expect(decide(row.local, row.folder, row.now ?? NOW)).toEqual(row.expected);
    });
  }

  it('never fast-forwards while it holds writes of its own, whatever the folder', () => {
    const folders = rows.map((row) => row.folder).filter((folder) => folder.length > 0);
    for (const folder of folders) {
      for (const flags of [{ unpushed: true }, { unconfirmed: pushed(ref(44)) }]) {
        expect(decide(local(ref(44), flags), folder, NOW).kind).not.toBe('fast-forward');
      }
    }
  });
});

describe('settled', () => {
  it('is a version Drive created ten minutes ago or more, on Drive’s clock', () => {
    expect(settled(v(44, PC, ref(43), 1_000), 1_000 + SETTLE_MS)).toBe(true);
    expect(settled(v(44, PC, ref(43), 1_000), 1_000 + SETTLE_MS - 1)).toBe(false);
  });

  it('never settles anything when Drive’s clock is unknown', () => {
    expect(settled(v(44, PC, ref(43), 1_000), Number.NaN)).toBe(false);
  });
});

describe('latestVersion', () => {
  it('is the highest number', () => {
    expect(latestVersion([v(2), v(9), v(4)])).toEqual(v(9));
  });

  it('gives a number to the twin that reached Drive first, whatever its device id', () => {
    const twins = [v(44, PC, ref(43), 44_500), v(44, PHONE, ref(43), 44_000)];

    expect(latestVersion(twins)?.device).toBe(PHONE);
    expect(latestVersion([...twins].reverse())?.device).toBe(PHONE);
  });

  it('breaks a tie in the same millisecond by the lower device id, the same on every device', () => {
    const twins = [v(44, PHONE, ref(43), 44_000), v(44, PC, ref(43), 44_000)];

    expect(latestVersion(twins)?.device).toBe(PC);
    expect(latestVersion([...twins].reverse())?.device).toBe(PC);
  });

  it('is null for an empty folder', () => {
    expect(latestVersion([])).toBeNull();
  });
});

describe('versionsIn', () => {
  it('reads the versions out of a listing, with their creation times, and skips anything else', () => {
    expect(
      versionsIn([
        { path: 'versions/000002-pc4f2a.000001-pc4f2a.bjs', size: 10, created: 2_000 },
        { path: 'versions/notes.txt', size: 1, created: 3_000 },
      ]),
    ).toEqual([v(2, PC, ref(1), 2_000)]);
  });
});
