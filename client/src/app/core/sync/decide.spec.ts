import { decide, Decision, latestVersion, LocalState } from './decide';
import { VersionRef } from './layout';

/**
 * Every row of the decision table (#2029, PRD § 5.2). Each row names the case
 * as the owner would meet it.
 */
const v = (seq: number, device = 'pc4f2a'): VersionRef => ({ seq, device });

const rows: { name: string; local: LocalState; remote: VersionRef[]; expected: Decision }[] = [
  {
    name: 'a device with nothing, and an empty folder: nothing to do',
    local: { base: null, changes: false },
    remote: [],
    expected: { kind: 'nothing' },
  },
  {
    name: 'the first device of an academy publishes version 1',
    local: { base: null, changes: true },
    remote: [],
    expected: { kind: 'push', seq: 1, parent: null },
  },
  {
    name: 'a newly paired device pulls the latest',
    local: { base: null, changes: false },
    remote: [v(1), v(2)],
    expected: { kind: 'fast-forward', to: v(2) },
  },
  {
    name: 'a device with an academy of its own meets a folder with another: the owner chooses',
    local: { base: null, changes: true },
    remote: [v(3)],
    expected: { kind: 'unrelated', latest: v(3) },
  },
  {
    name: 'up to date, nothing done: nothing to do',
    local: { base: v(42), changes: false },
    remote: [v(41), v(42)],
    expected: { kind: 'nothing' },
  },
  {
    name: 'up to date, with changes: push the next version',
    local: { base: v(42), changes: true },
    remote: [v(41), v(42)],
    expected: { kind: 'push', seq: 43, parent: 42 },
  },
  {
    name: 'behind, nothing done: fast-forward',
    local: { base: v(42), changes: false },
    remote: [v(42), v(43, 'phone9c1e')],
    expected: { kind: 'fast-forward', to: v(43, 'phone9c1e') },
  },
  {
    name: 'behind, with changes: rebase onto the latest',
    local: { base: v(42), changes: true },
    remote: [v(42), v(43, 'phone9c1e')],
    expected: { kind: 'rebase', onto: v(43, 'phone9c1e') },
  },
  {
    name: 'behind a base that retention already pruned: still a fast-forward',
    local: { base: v(30), changes: false },
    remote: [v(44), v(45)],
    expected: { kind: 'fast-forward', to: v(45) },
  },
  {
    name: 'lost the race for a number: rebase, even with no new changes',
    local: { base: v(44, 'phone9c1e'), changes: false },
    remote: [v(43), v(44, 'pc4f2a'), v(44, 'phone9c1e')],
    expected: { kind: 'rebase', onto: v(44, 'pc4f2a') },
  },
  {
    name: 'lost the race, and others pushed on top since: still a rebase, never a fast-forward',
    local: { base: v(44, 'phone9c1e'), changes: false },
    remote: [v(44, 'pc4f2a'), v(44, 'phone9c1e'), v(45, 'pc4f2a')],
    expected: { kind: 'rebase', onto: v(45, 'pc4f2a') },
  },
  {
    name: 'its version never landed, and another holds the number: rebase',
    local: { base: v(44, 'pc4f2a'), changes: false },
    remote: [v(43), v(44, 'phone9c1e')],
    expected: { kind: 'rebase', onto: v(44, 'phone9c1e') },
  },
  {
    name: 'the folder lost the versions this device saw: publish again above them',
    local: { base: v(42), changes: false },
    remote: [v(40)],
    expected: { kind: 'push', seq: 43, parent: 42 },
  },
  {
    name: 'the folder was emptied: publish again',
    local: { base: v(42), changes: false },
    remote: [],
    expected: { kind: 'push', seq: 43, parent: 42 },
  },
];

describe('decide (#2029)', () => {
  for (const row of rows) {
    it(row.name, () => {
      expect(decide(row.local, row.remote)).toEqual(row.expected);
    });
  }
});

describe('latestVersion', () => {
  it('is the highest number', () => {
    expect(latestVersion([v(2), v(9), v(4)])).toEqual(v(9));
  });

  it('breaks a tie the same way on every device: the lower device id', () => {
    const twins = [v(44, 'phone9c1e'), v(44, 'pc4f2a')];

    expect(latestVersion(twins)).toEqual(v(44, 'pc4f2a'));
    expect(latestVersion([...twins].reverse())).toEqual(v(44, 'pc4f2a'));
  });

  it('is null for an empty folder', () => {
    expect(latestVersion([])).toBeNull();
  });
});
