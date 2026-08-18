/**
 * What the app tells the owner about a pending update (#1339) — the state, not
 * the plumbing.
 *
 * Until now the updater downloaded 113 MB in complete silence and fired a
 * single native notification when it finished. That is the easiest kind of
 * signal to miss: transient, outside the app, and shown exactly once. Someone
 * whose window was not focused at that moment never learned an update was
 * waiting at all.
 *
 * So the renderer gets a state instead of an event, and paints a bar only when
 * that state has something to say.
 *
 * **The load-bearing rule is that `ready` is terminal until the app quits.**
 * The updater polls every six hours; a check that fails after a download
 * already succeeded must not erase the fact that a version is sitting on disk
 * waiting to install. Going offline is not the same as the update going away,
 * and a bar that vanishes for that reason is worse than no bar — it teaches the
 * owner that what it says is not to be trusted.
 */

export type UpdateStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'downloading'; readonly version: string; readonly percent: number }
  | { readonly phase: 'ready'; readonly version: string };

export function idleUpdateStatus(): UpdateStatus {
  return { phase: 'idle' };
}

/**
 * Clamped and floored because it is rendered.
 *
 * electron-updater reports a float, and on a resumed or mis-reported transfer
 * it can arrive above 100 or below 0. "Scaricamento… 103.7%" is the kind of
 * detail that makes someone doubt everything else the app tells them.
 */
function displayPercent(percent: number): number {
  // Only NaN needs the guard: it poisons `Math.min`/`Math.max` into NaN, while
  // the infinities clamp correctly on their own and mean what the clamp says.
  if (Number.isNaN(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.floor(percent)));
}

export function onUpdateAvailable(current: UpdateStatus, version: string): UpdateStatus {
  // A newly-announced version does not undo one already on disk. Only
  // `update-downloaded` moves us forward from `ready`, and the app installs on
  // quit either way — so the honest thing to keep showing is the one that is
  // actually ready to install.
  if (current.phase === 'ready') {
    return current;
  }

  return { phase: 'downloading', version, percent: 0 };
}

export function onDownloadProgress(current: UpdateStatus, percent: number): UpdateStatus {
  // Progress for something already downloaded is stale traffic from a previous
  // transfer; and progress with no announced version has no version to name.
  if (current.phase !== 'downloading') {
    return current;
  }

  return { ...current, percent: displayPercent(percent) };
}

export function onUpdateDownloaded(_current: UpdateStatus, version: string): UpdateStatus {
  return { phase: 'ready', version };
}

/**
 * A failed check clears a download in flight, and never clears a finished one.
 *
 * Offline, rate-limited, release yanked — none of these are worth telling the
 * owner about, which is why this returns to silence rather than to an error
 * state. But a downloaded update is a fact about the disk, not about the
 * network, and it survives.
 */
export function onUpdateError(current: UpdateStatus): UpdateStatus {
  return current.phase === 'ready' ? current : idleUpdateStatus();
}
