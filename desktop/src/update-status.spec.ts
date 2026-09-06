import { describe, expect, it } from 'vitest';

import {
  idleUpdateStatus,
  onCheckStarted,
  onDownloadProgress,
  onUpdateAvailable,
  onUpdateDownloaded,
  onUpdateError,
  onUpdateNotAvailable,
  type UpdateStatus,
} from './update-status.js';

/**
 * The update bar's state (#1339).
 *
 * Most of this is bookkeeping. The tests that matter are the ones about what
 * happens when things go wrong afterwards: an update already downloaded is a
 * fact about the disk, and no amount of subsequent network trouble makes it
 * untrue. A bar that disappears because a later poll failed is worse than no
 * bar, because it teaches the owner not to believe it.
 */

const downloading = (version: string, percent: number): UpdateStatus => ({
  phase: 'downloading',
  version,
  percent,
});

describe('the happy path', () => {
  it('starts silent', () => {
    expect(idleUpdateStatus()).toEqual({ phase: 'idle' });
  });

  it('announces the version as soon as the download starts, not when it ends', () => {
    // The whole point of #1339: 113 MB used to transfer with nothing on screen.
    expect(onUpdateAvailable(idleUpdateStatus(), '2.44.1')).toEqual({
      phase: 'downloading',
      version: '2.44.1',
      percent: 0,
    });
  });

  it('tracks progress against the announced version', () => {
    const next = onDownloadProgress(downloading('2.44.1', 0), 47.8);

    expect(next).toEqual({ phase: 'downloading', version: '2.44.1', percent: 47 });
  });

  it('ends ready, naming the version that will install', () => {
    expect(onUpdateDownloaded(downloading('2.44.1', 99), '2.44.1')).toEqual({
      phase: 'ready',
      version: '2.44.1',
    });
  });
});

describe('a downloaded update survives whatever happens next', () => {
  // The updater polls every six hours. Closing the laptop lid, losing wifi, or
  // GitHub rate-limiting the check must not erase an installer already sitting
  // on disk waiting for the next quit.
  it('keeps the bar when a later check fails', () => {
    const ready: UpdateStatus = { phase: 'ready', version: '2.44.1' };

    expect(onUpdateError(ready)).toEqual(ready);
  });

  it('keeps the ready version when a newer one is announced', () => {
    // Both install on quit, and only one of them actually exists on disk right
    // now. Naming the other would be a promise we cannot keep.
    const ready: UpdateStatus = { phase: 'ready', version: '2.44.1' };

    expect(onUpdateAvailable(ready, '2.45.0')).toEqual(ready);
  });

  it('ignores stale progress once ready', () => {
    const ready: UpdateStatus = { phase: 'ready', version: '2.44.1' };

    expect(onDownloadProgress(ready, 12)).toEqual(ready);
  });

  it('does move forward when the newer version finishes downloading', () => {
    const ready: UpdateStatus = { phase: 'ready', version: '2.44.1' };

    expect(onUpdateDownloaded(ready, '2.45.0')).toEqual({ phase: 'ready', version: '2.45.0' });
  });
});

describe('failures stay silent', () => {
  // Offline, rate-limited, release yanked. None of these are the owner's
  // problem, and none of them are worth a red banner over the app.
  it('returns to silence when a download in flight fails', () => {
    expect(onUpdateError(downloading('2.44.1', 30))).toEqual({ phase: 'idle' });
  });

  it('stays silent when a check fails from silence', () => {
    expect(onUpdateError(idleUpdateStatus())).toEqual({ phase: 'idle' });
  });

  it('ignores progress arriving with nothing announced', () => {
    // No announced version means nothing to name in the bar. Inventing one is
    // worse than showing nothing.
    expect(onDownloadProgress(idleUpdateStatus(), 40)).toEqual({ phase: 'idle' });
  });
});

describe('the percentage is rendered, so it is made safe here', () => {
  // "Scaricamento… 103.7%" is the kind of detail that makes someone doubt
  // everything else the app tells them.
  it.each([
    [-5, 0],
    [0, 0],
    [47.8, 47],
    [99.99, 99],
    [100, 100],
    [103.7, 100],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 100],
  ])('renders %s as %s', (input, expected) => {
    const next = onDownloadProgress(downloading('2.44.1', 0), input);

    expect(next).toMatchObject({ percent: expected });
  });
});

describe('saying that a check happened (#1401)', () => {
  it('announces the check itself, which used to be silent', () => {
    expect(onCheckStarted(idleUpdateStatus())).toEqual({ phase: 'checking' });
  });

  it('says so when there is nothing to get', () => {
    // The one piece of news the app never delivered: "no update" and "never
    // looked" both produced silence, which is why a button was asked for.
    expect(onUpdateNotAvailable({ phase: 'checking' })).toEqual({ phase: 'up-to-date' });
  });

  it('runs the whole no-op check as a sequence', () => {
    const after = onUpdateNotAvailable(onCheckStarted(idleUpdateStatus()));

    expect(after).toEqual({ phase: 'up-to-date' });
  });

  it('never paints over an update already sitting on disk', () => {
    // A poll looking for a newer version must not erase the one that is
    // downloaded and waiting — the same rule the rest of this engine follows.
    const ready: UpdateStatus = { phase: 'ready', version: '2.49.0' };

    expect(onCheckStarted(ready)).toEqual(ready);
    expect(onUpdateNotAvailable(ready)).toEqual(ready);
  });

  it('lets a check in flight still find something', () => {
    expect(onUpdateAvailable({ phase: 'checking' }, '2.49.0')).toEqual({
      phase: 'downloading',
      version: '2.49.0',
      percent: 0,
    });
  });

  it('clears a failed check instead of leaving it spinning', () => {
    // Without this a network error mid-check leaves the button turning
    // forever, which reads as broken rather than as offline.
    expect(onUpdateError({ phase: 'checking' })).toEqual({ phase: 'idle' });
    expect(onUpdateError({ phase: 'up-to-date' })).toEqual({ phase: 'idle' });
  });
});
