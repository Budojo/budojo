import { decide, Decision, latestVersion, LocalState, onLine } from './decide';
import { ListedVersion, VersionRef } from './layout';

/**
 * Every row of the decision table (#2029, PRD § 5.2), each named as the owner
 * would meet it. The races and the pruned folders come from the review of
 * #2061: each is a way a write could have been dropped without anyone knowing.
 */
const PC = 'pc4f2a';
const PHONE = 'phone9c1e';
const ref = (seq: number, device = PC): VersionRef => ({ seq, device });
/** A version on top of `parent`; by default the PC's previous one. */
const v = (
  seq: number,
  device = PC,
  parent: VersionRef | null = seq > 1 ? ref(seq - 1) : null,
): ListedVersion => ({
  seq,
  device,
  parent,
});
const local = (
  base: VersionRef | null,
  flags: Partial<Omit<LocalState, 'base'>> = {},
): LocalState => ({
  base,
  unpushed: false,
  pushedUnconfirmed: false,
  ...flags,
});

const rows: { name: string; local: LocalState; folder: ListedVersion[]; expected: Decision }[] = [
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
    local: local(ref(44, PHONE), { pushedUnconfirmed: true }),
    folder: [v(44, PHONE, ref(43)), v(45, PC, ref(44, PHONE))],
    expected: { kind: 'fast-forward', to: ref(45) },
  },
  {
    name: 'its own push, already pruned but named as a parent: still on the line',
    local: local(ref(44, PHONE), { pushedUnconfirmed: true }),
    folder: [v(45, PC, ref(44, PHONE)), v(46)],
    expected: { kind: 'fast-forward', to: ref(46) },
  },
  {
    name: 'lost the race for its number: rebase, even with nothing new',
    local: local(ref(44, PHONE), { pushedUnconfirmed: true }),
    folder: [v(43), v(44), v(44, PHONE, ref(43))],
    expected: { kind: 'rebase', onto: ref(44) },
  },
  {
    name: 'won the tie, but the other device built on its own twin first: rebase, never a fast-forward',
    local: local(ref(44), { pushedUnconfirmed: true }),
    folder: [v(43), v(44), v(44, PHONE, ref(43)), v(45, PHONE, ref(44, PHONE))],
    expected: { kind: 'rebase', onto: ref(45, PHONE) },
  },
  {
    name: 'its push never landed, and others pushed above: rebase',
    local: local(ref(44), { pushedUnconfirmed: true }),
    folder: [v(43), v(44, PHONE, ref(43)), v(45, PHONE, ref(44, PHONE))],
    expected: { kind: 'rebase', onto: ref(45, PHONE) },
  },
  {
    name: 'lost a race while offline, and both twins have since been pruned: still a rebase',
    local: local(ref(44, PHONE), { pushedUnconfirmed: true }),
    folder: [v(45, PC, ref(44)), v(46)],
    expected: { kind: 'rebase', onto: ref(46) },
  },
  {
    name: 'a base too old to trace, with nothing of its own unconfirmed: fast-forward',
    local: local(ref(30)),
    folder: [v(44), v(45)],
    expected: { kind: 'fast-forward', to: ref(45) },
  },
  {
    name: 'it had pulled the losing twin, and has nothing of its own: fast-forward to the line',
    local: local(ref(44, PHONE)),
    folder: [v(44), v(44, PHONE, ref(43)), v(45)],
    expected: { kind: 'fast-forward', to: ref(45) },
  },
  {
    name: 'the folder is behind this device, on another line: the owner chooses, nobody pushes over it',
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
      expect(decide(row.local, row.folder)).toEqual(row.expected);
    });
  }
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

  it('breaks a tie the same way on every device: the lower device id', () => {
    const twins = [v(44, PHONE, ref(43)), v(44)];

    expect(latestVersion(twins)).toEqual(v(44));
    expect(latestVersion([...twins].reverse())).toEqual(v(44));
  });

  it('is null for an empty folder', () => {
    expect(latestVersion([])).toBeNull();
  });
});
