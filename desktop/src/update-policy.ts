/**
 * When Budojo may update itself (#1287).
 *
 * Pure decisions, no IO, so every refusal is unit-tested: the main process only
 * wires the answer to `electron-updater`. Getting this wrong is not cosmetic —
 * a dev build pointed at the public releases would try to "update" a working
 * tree, and a locally packaged one would replace itself with the shipped app.
 *
 * There was a third refusal here until #1272, for the self-extracting portable
 * build that electron-updater cannot rewrite while it runs. That target is no
 * longer produced, so the check could not fire; it went with it rather than
 * staying as a branch no artefact can reach. Bringing the portable back means
 * bringing the refusal back in the same change — the reason it existed has not
 * stopped being true, only stopped being reachable.
 */

export interface UpdateEnvironment {
  /** `app.isPackaged` — false when running from source. */
  packaged: boolean;
  /** Our own dev flag (`ELECTRON_DEV=1`). */
  dev: boolean;
  /**
   * `app.getVersion()`. A local `make desktop-package` leaves package.json's
   * placeholder, because CI injects the real version at release time — and a
   * placeholder is lower than every published release, so the build you just
   * made to test your own changes would replace itself with the shipped one.
   */
  version: string;
}

/** package.json's placeholder — never a real release. */
const UNVERSIONED = '0.0.0';

export type UpdateDecision =
  | { readonly check: true }
  | { readonly check: false; readonly reason: string };

/**
 * The updater can only replace an *installed* application. Everything else is a
 * refusal with a reason worth logging — silence here is how "updates quietly
 * never happened" becomes a year-old install.
 */
export function planUpdateCheck(env: UpdateEnvironment): UpdateDecision {
  if (env.dev) {
    return { check: false, reason: 'development run' };
  }

  if (!env.packaged) {
    return { check: false, reason: 'not a packaged build' };
  }

  if (env.version === UNVERSIONED) {
    // Observed for real: a locally packaged build reports 0.0.0, finds every
    // published release "newer", and would quietly install the shipped app
    // over the one you are testing.
    return { check: false, reason: `local build (${UNVERSIONED}) — not a released version` };
  }

  return { check: true };
}

/**
 * Reduce an updater failure to one line worth logging.
 *
 * electron-updater's messages carry the whole HTTP exchange — headers, body,
 * stack — so an offline laptop or a release without a manifest wrote ~40 lines
 * per attempt, every six hours. The first line says what happened; the rest is
 * noise that buries anything real.
 */
export function updateFailureLine(message: string): string {
  const [first = ''] = message.split('\n');

  return first.trim().slice(0, 200);
}

/**
 * What to tell the user once a version is sitting on disk, ready.
 *
 * Deliberately not "restart now?": the install happens on quit, so the honest
 * message is that it is already waiting, and closing the app is all it takes.
 * Interrupting an instructor mid-check-in to ask about a restart would be worse
 * than the update being a day late.
 */
export function updateReadyMessage(version: string): { title: string; body: string } {
  return {
    title: `Budojo ${version} is ready`,
    body: 'It will be installed the next time you close Budojo. Nothing to do.',
  };
}
