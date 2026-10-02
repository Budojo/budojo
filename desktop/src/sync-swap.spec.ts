import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planStagedSwap, reconcileMarker, SwapLayout, SwapStep } from './sync-swap.js';

/**
 * The staged swap (#2032), played on a set of file names: every step a plan
 * takes, and every start that dies halfway through one.
 */
const root = path.join('data');
const layout: SwapLayout = {
  databasePath: path.join(root, 'budojo.sqlite'),
  filesDir: path.join(root, 'storage', 'app'),
};
const db = layout.databasePath;
const files = layout.filesDir;

/** Files by name, with what they hold, so a rename can be followed. */
type Disk = Map<string, string>;

function apply(disk: Disk, steps: SwapStep[]): void {
  for (const step of steps) {
    if (step.kind === 'mark') {
      disk.set(step.path, 'marker');
    } else if (step.kind === 'remove') {
      disk.delete(step.path);
    } else {
      const content = disk.get(step.from);
      if (content === undefined || disk.has(step.to)) {
        throw new Error(`cannot rename ${step.from} to ${step.to}`);
      }
      disk.delete(step.from);
      disk.set(step.to, content);
    }
  }
}

function plan(disk: Disk): SwapStep[] {
  return planStagedSwap(layout, (file) => disk.has(file));
}

describe('planStagedSwap (#2032)', () => {
  it('does nothing when nothing is staged', () => {
    expect(plan(new Map([[db, 'mine']]))).toEqual([]);
  });

  it('swaps the staged database in, its own aside as .previous with its WAL, and asks for the reconcile', () => {
    const disk: Disk = new Map([
      [db, 'mine'],
      [`${db}-wal`, 'my writes'],
      [`${db}-shm`, 'index'],
      [`${db}.staged`, 'theirs'],
    ]);

    apply(disk, plan(disk));

    expect(Object.fromEntries(disk)).toEqual({
      [db]: 'theirs',
      [`${db}.previous`]: 'mine',
      [`${db}.previous-wal`]: 'my writes',
      [reconcileMarker(db)]: 'marker',
    });
  });

  it('brings staged files in with the database, its own aside', () => {
    const disk: Disk = new Map([
      [db, 'mine'],
      [files, 'my files'],
      [`${files}.staged`, 'their files'],
      [`${db}.staged`, 'theirs'],
    ]);

    apply(disk, plan(disk));

    expect(disk.get(files)).toBe('their files');
    expect(disk.get(`${files}.previous`)).toBe('my files');
    expect(disk.get(db)).toBe('theirs');
  });

  it('removes files staged with no database: a restore cut short', () => {
    const disk: Disk = new Map([
      [db, 'mine'],
      [`${files}.staged`, 'half'],
    ]);

    apply(disk, plan(disk));

    expect(Object.fromEntries(disk)).toEqual({ [db]: 'mine' });
  });

  it('drops an older .previous only once a live database takes its place', () => {
    const disk: Disk = new Map([
      [db, 'mine'],
      [`${db}.previous`, 'older'],
      [`${db}.previous-wal`, 'older writes'],
      [`${db}.staged`, 'theirs'],
    ]);

    apply(disk, plan(disk));

    expect(disk.get(`${db}.previous`)).toBe('mine');
    expect(disk.has(`${db}.previous-wal`)).toBe(false);
  });

  it('never leaves a rollback journal beside the database it swapped in', () => {
    const disk: Disk = new Map([
      [db, 'mine'],
      [`${db}-journal`, 'hot journal'],
      [`${db}.staged`, 'theirs'],
    ]);

    apply(disk, plan(disk));

    expect(disk.has(`${db}-journal`)).toBe(false);
    expect(disk.get(`${db}.previous-journal`)).toBe('hot journal');
  });

  it('finishes the swap whatever step a start died at', () => {
    const start = (): Disk =>
      new Map([
        [db, 'mine'],
        [`${db}-wal`, 'my writes'],
        [`${db}-shm`, 'index'],
        [`${db}.previous`, 'older'],
        [files, 'my files'],
        [`${files}.staged`, 'their files'],
        [`${db}.staged`, 'theirs'],
      ]);
    const whole = start();
    apply(whole, plan(whole));
    const steps = plan(start());

    for (let died = 0; died < steps.length; died++) {
      const disk = start();
      apply(disk, steps.slice(0, died));
      apply(disk, plan(disk));
      expect(Object.fromEntries(disk), `died after ${died} steps`).toEqual(Object.fromEntries(whole));
    }
  });
});
