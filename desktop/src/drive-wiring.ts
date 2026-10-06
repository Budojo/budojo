import { readFile, writeFile } from 'node:fs/promises';

import type { BackupService } from './backup.js';
import type { DataLayout, Secrets } from './bootstrap.js';
import * as drive from './drive-io.js';
import type { DriveClientConfig, DriveTokens } from './drive-io.js';
import { DriveSyncService, type DriveSyncIO } from './drive-service.js';
import { parseState, serialiseState, type DriveState } from './drive-state.js';
import { KEYS_FILE } from './sync-keys.js';
import type { TokenVault } from './token-vault.js';

/**
 * Builds the real `DriveSyncIO` (#1301). Nothing here decides anything — it is
 * the wiring between `DriveSyncService` and the world.
 *
 * **`clientSecret` is not a secret** for an installed app: the binary is on
 * the user's disk, Google documents this for "Desktop app" clients, and it is
 * precisely why the flow uses PKCE. Its leaking is not the threat model — the
 * authorization code is useless without the verifier.
 */

/**
 * The OAuth client, from the artefact rather than from the machine (#1331).
 *
 * This used to read `process.env` at **launch**, on the end user's computer,
 * while its own comment claimed the values were substituted at build time.
 * Nothing substituted anything — `tsc` performs no substitution,
 * `electron-builder.yml` defined nothing, `release.yml` never mentioned the
 * variables — so the client was always null in a shipped build and the whole
 * of #1301 was unreachable in every installer. Setting the two GitHub secrets,
 * the obvious fix, would have changed nothing.
 *
 * Now the values ride in the artefact's own `package.json`, injected by
 * `electron-builder`'s `extraMetadata` at package time. That is the mechanism
 * the release already uses for the version number, so it is one channel rather
 * than a second one to keep working.
 *
 * @param baked `package.json` from the packaged app — whatever `extraMetadata`
 *              put there, unvalidated, because it is JSON assembled by a shell
 *              command and a mis-quoted argument can land any shape
 * @param env   development only. `main.ts` passes `process.env` under
 *              `ELECTRON_DEV` and an **empty object** otherwise, which is what
 *              makes a shipped build unable to be influenced by anything on
 *              the machine it runs on — not merely unlikely to be
 */
export function driveClientConfig(
  baked: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): DriveClientConfig | null {
  const clientId =
    nonEmpty(baked['budojoGoogleClientId']) ?? nonEmpty(env.BUDOJO_GOOGLE_CLIENT_ID);
  const clientSecret =
    nonEmpty(baked['budojoGoogleClientSecret']) ?? nonEmpty(env.BUDOJO_GOOGLE_CLIENT_SECRET);

  // No client configured means the feature is simply not available. The UI asks
  // the state, sees `configured: false`, and says so — rather than offering a
  // Connect button that opens a Google error page. Half a client is the same
  // answer: it cannot complete a flow either.
  if (clientId === null || clientSecret === null) {
    return null;
  }

  return { clientId, clientSecret };
}

/**
 * A usable string, or nothing.
 *
 * Blank counts as absent because that is what an unpopulated CI secret expands
 * to — an empty string, not a missing key — and a client that looks configured
 * and fails at Google is worse than one that is honestly absent.
 */
function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

export function createDriveSyncIO(input: {
  config: DriveClientConfig;
  layout: DataLayout;
  /** Reused as-is: it already holds a string encrypted through safeStorage. */
  vault: TokenVault;
  backupService: BackupService;
  openExternal: (url: string) => Promise<void>;
  /** This PC's keys from the OS keychain, for the phone (#2033). */
  localSecrets: () => Promise<Secrets>;
  log: (line: string) => void;
}): DriveSyncIO {
  const { config, layout, vault, backupService, openExternal, localSecrets, log } = input;

  const readTokens = async (): Promise<DriveTokens | null> => {
    const raw = vault.get();
    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as DriveTokens;
    } catch {
      // A corrupt blob is treated as "not linked" rather than crashing the
      // sync; the owner reconnects and it is rewritten.
      log('drive: stored tokens unreadable, treating as disconnected');

      return null;
    }
  };

  return {
    readState: async (): Promise<DriveState> => {
      try {
        return parseState(await readFile(layout.driveStateFile, 'utf8'));
      } catch {
        return parseState(null);
      }
    },

    writeState: async (state) => {
      await writeFile(layout.driveStateFile, serialiseState(state), 'utf8');
    },

    readTokens,
    writeTokens: async (tokens) => {
      vault.set(JSON.stringify(tokens));
    },
    clearTokens: async () => {
      vault.clear();
    },

    authorize: () => drive.authorize(config, openExternal),
    authorizeWithAppData: () => drive.authorize(config, openExternal, true),
    localSecrets,
    findKeys: (tokens) => drive.findAppDataFiles(tokens, KEYS_FILE),
    readKeys: (tokens, id) => drive.readAppDataFile(tokens, id),
    writeKeys: (tokens, text) => drive.createAppDataFile(tokens, KEYS_FILE, text),
    ensureFresh: (tokens) => drive.ensureFresh(config, tokens),
    fetchDrive: (tokens, request) => drive.fetchDrive(tokens, request),
    readItem: (tokens, id) => drive.readItem(tokens, id),
    accountEmail: (tokens) => drive.accountEmail(tokens),
    ensureFolder: (tokens) => drive.ensureFolder(tokens),
    listRemote: (tokens, folderId) => drive.listArchives(tokens, folderId),
    upload: (tokens, folderId, filePath, name) => drive.uploadArchive(tokens, folderId, filePath, name),
    remove: (tokens, fileId) => drive.deleteFile(tokens, fileId),
    revoke: (refreshToken) => drive.revoke(refreshToken),

    localArchives: () => backupService.list(),
    log,
    now: () => Date.now(),
  };
}

export { DriveSyncService };
