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
  | { readonly phase: 'checking' }
  | { readonly phase: 'up-to-date' }
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

/**
 * A check has started (#1401).
 *
 * Published so the renderer can say so — before this, a check was completely
 * silent unless it found something, which is exactly why someone pressing a
 * "check now" button could not tell whether anything had happened.
 *
 * `ready` still wins: a version sitting on disk is a fact, and a fresh poll
 * looking for another one must not paint over it.
 */
export function onCheckStarted(current: UpdateStatus): UpdateStatus {
  return current.phase === 'ready' ? current : { phase: 'checking' };
}

/**
 * The check finished and there was nothing to get.
 *
 * This is the one piece of news the app never delivered. "No update" and
 * "never looked" are indistinguishable when both produce silence, and the
 * whole reason to add a button was that the automatic check at launch was
 * invisible.
 *
 * It is a **transient** state: how long "you're up to date" stays on screen
 * before falling back to the version is a presentation decision and lives in
 * the renderer, not in this engine, which would otherwise need a clock.
 */
export function onUpdateNotAvailable(current: UpdateStatus): UpdateStatus {
  return current.phase === 'ready' ? current : { phase: 'up-to-date' };
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
 *
 * It also clears `checking` and `up-to-date`, which is what stops a failed
 * check from leaving a spinner turning forever.
 */
export function onUpdateError(current: UpdateStatus): UpdateStatus {
  return current.phase === 'ready' ? current : idleUpdateStatus();
}
