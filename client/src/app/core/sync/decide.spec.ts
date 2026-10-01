import {
  decide,
  Decision,
  latestVersion,
  LocalState,
  onLine,
  SeenVersion,
  settled,
  SETTLE_MS,
  versionsIn,
} from './decide';
import { VersionRef } from './layout';

/**
 * Every row of the decision table (#2029, PRD § 5.2), each named as the owner
 * would meet it. The races and the pruned folders come from the two reviews of
 * #2061: each is a way a write could have been dropped without anyone knowing.
 */
const PC = 'pc4f2a';
const PHONE = 'phone9c1e';
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
): LocalState => ({ device: PC, base, unpushed: false, unconfirmed: null, ...flags });

const rows: { name: string; local: LocalState; folder: SeenVersion[]; expected: Decision }[] = [
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
    name: 'behind, nothing done: fast-forward',
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
    name: 'its own push, since built on by the other device: on the line, so a fast-forward',
    local: local(ref(44), { unconfirmed: ref(44) }),
    folder: [v(44), v(45, PHONE, ref(44))],
    expected: { kind: 'fast-forward', to: ref(45, PHONE) },
  },
  {
    name: 'its own push, already pruned but named as a parent: still on the line',
    local: local(ref(44), { unconfirmed: ref(44) }),
    folder: [v(45, PHONE, ref(44)), v(46, PHONE, ref(45, PHONE))],
    expected: { kind: 'fast-forward', to: ref(46, PHONE) },
  },
  {
    name: 'its twin reached Drive first: rebase onto it, even with nothing new',
    local: local(ref(44), { unconfirmed: ref(44) }),
    folder: [v(43), v(44, PHONE, ref(43), 44_000), v(44, PC, ref(43), 44_500)],
    expected: { kind: 'rebase', onto: ref(44, PHONE) },
  },
  {
    name: 'it reached Drive first, whatever its device id: the twin rebases, it does nothing',
    local: { device: PHONE, base: ref(44, PHONE), unpushed: false, unconfirmed: ref(44, PHONE) },
    folder: [v(43), v(44, PC, ref(43), 44_500), v(44, PHONE, ref(43), 44_000)],
    expected: { kind: 'nothing' },
  },
  {
    name: 'it saw itself on the line, then the other device built on its own twin: rebase, never a fast-forward',
    local: local(ref(44), { unconfirmed: ref(44) }),
    folder: [
      v(43),
      v(44, PC, ref(43), 44_000),
      v(44, PHONE, ref(43), 44_500),
      v(45, PHONE, ref(44, PHONE)),
    ],
    expected: { kind: 'rebase', onto: ref(45, PHONE) },
  },
  {
    name: 'its push never landed, and others pushed above: rebase',
    local: local(ref(44), { unconfirmed: ref(44) }),
    folder: [v(43), v(44, PHONE, ref(43)), v(45, PHONE, ref(44, PHONE))],
    expected: { kind: 'rebase', onto: ref(45, PHONE) },
  },
  {
    name: 'lost a race while offline, and both twins have since been pruned: still a rebase',
    local: local(ref(44), { unconfirmed: ref(44) }),
    folder: [v(45, PHONE, ref(44, PHONE)), v(46, PHONE, ref(45, PHONE))],
    expected: { kind: 'rebase', onto: ref(46, PHONE) },
  },
  {
    name: 'back after weeks, its own settled base pruned since: a fast-forward, nobody is asked',
    local: local(ref(30)),
    folder: [v(44), v(45)],
    expected: { kind: 'fast-forward', to: ref(45) },
  },
  {
    name: 'it had pulled another device’s losing twin, and has nothing of its own: fast-forward to the line',
    local: local(ref(44, PHONE)),
    folder: [v(44, PC, ref(43), 44_000), v(44, PHONE, ref(43), 44_500), v(45)],
    expected: { kind: 'fast-forward', to: ref(45) },
  },
  {
    name: 'its own settled version is provably off this line: another folder, so the owner chooses',
    local: { device: PHONE, base: ref(45, PHONE), unpushed: false, unconfirmed: null },
    folder: [v(44), v(45), v(46)],
    expected: { kind: 'ask', latest: ref(46) },
  },
  {
    name: 'the folder is behind this device: the owner chooses, nobody pushes over it',
    local: { device: PHONE, base: ref(45, PHONE), unpushed: false, unconfirmed: null },
    folder: [v(43)],
    expected: { kind: 'ask', latest: ref(43) },
  },
  {
    name: 'the folder is behind its own unconfirmed push: the owner chooses',
    local: local(ref(44), { unconfirmed: ref(44) }),
    folder: [v(42), v(43)],
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
      expect(decide(row.local, row.folder)).toEqual(row.expected);
    });
  }
});

describe('settled', () => {
  const folder = [v(43), v(44, PC, ref(43), 1_000)];

  it('is a version on the line that Drive created ten minutes ago or more', () => {
    expect(settled(ref(44), folder, 1_000 + SETTLE_MS)).toBe(true);
  });

  it('is not one created a moment ago, however alone it looks: its twin may not be listed yet', () => {
    expect(settled(ref(44), folder, 1_000 + 60_000)).toBe(false);
  });

  it('is not one off the line, however old', () => {
    const lost = [v(43), v(44, PHONE, ref(43), 500), v(44, PC, ref(43), 1_000)];

    expect(settled(ref(44), lost, 1_000 + SETTLE_MS * 10)).toBe(false);
  });

  it('judges a pruned version by the one naming it as parent, which is younger', () => {
    const pruned = [v(45, PHONE, ref(44), 2_000)];

    expect(settled(ref(44), pruned, 2_000 + SETTLE_MS - 1)).toBe(false);
    expect(settled(ref(44), pruned, 2_000 + SETTLE_MS)).toBe(true);
  });
});

describe('onLine', () => {
  it('follows the parents down from the latest', () => {
    expect(onLine(ref(42), [v(42), v(43), v(44)])).toBe('yes');
  });

  it('says no once the walk passes the base’s number without meeting it', () => {
    expect(onLine(ref(43, PHONE), [v(42), v(43), v(44)])).toBe('no');
  });

  it('says unknown when a pruned parent stops the walk above the base', () => {
    expect(onLine(ref(30), [v(44), v(45)])).toBe('unknown');
  });

  it('says no for an empty folder', () => {
    expect(onLine(ref(1), [])).toBe('no');
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
