/**
 * When Budojo may update itself (#1287).
 *
 * Pure decisions, no IO, so every refusal is unit-tested: the main process only
 * wires the answer to `electron-updater`. Getting this wrong is not cosmetic —
 * asking the updater to replace a self-extracting portable executable fails on
 * every single launch, and a dev build pointed at the public releases would try
 * to "update" a working tree.
 */

export interface UpdateEnvironment {
  /** `app.isPackaged` — false when running from source. */
  packaged: boolean;
  /** Our own dev flag (`ELECTRON_DEV=1`). */
  dev: boolean;
  /**
   * `PORTABLE_EXECUTABLE_DIR`, set by electron-builder's portable stub. Its
   * presence is the documented way to know we are the self-extracting build.
   */
  portableDir: string | undefined;
}

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

  if (env.portableDir !== undefined && env.portableDir !== '') {
    // electron-updater cannot rewrite a running self-extracting exe. The
    // portable build is documented as manual-download-only.
    return { check: false, reason: 'portable build — updates are manual' };
  }

  return { check: true };
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
