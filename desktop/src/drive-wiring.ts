import { readFile, writeFile } from 'node:fs/promises';

import type { BackupService } from './backup.js';
import type { DataLayout } from './bootstrap.js';
import * as drive from './drive-io.js';
import type { DriveClientConfig, DriveTokens } from './drive-io.js';
import { DriveSyncService, type DriveSyncIO } from './drive-service.js';
import { parseState, serialiseState, type DriveState } from './drive-state.js';
import type { TokenVault } from './token-vault.js';

/**
 * Builds the real `DriveSyncIO` (#1301). Nothing here decides anything — it is
 * the wiring between `DriveSyncService` and the world.
 *
 * The OAuth client is read from the environment at build time rather than
 * hardcoded, so the shipped identity can change without a code edit and a fork
 * can use its own. **`clientSecret` is not a secret** for an installed app:
 * the binary is on the user's disk, Google documents this for "Desktop app"
 * clients, and it is precisely why the flow uses PKCE. It is committed to
 * nothing, but its leaking is not the threat model — the authorization code is
 * useless without the verifier.
 */

export function driveClientConfig(env: NodeJS.ProcessEnv = process.env): DriveClientConfig | null {
  const clientId = env.BUDOJO_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.BUDOJO_GOOGLE_CLIENT_SECRET?.trim();

  // No client configured means the feature is simply not available. The UI asks
  // the state, sees `configured: false`, and says so — rather than offering a
  // Connect button that opens a Google error page.
  if (clientId === undefined || clientId === '' || clientSecret === undefined || clientSecret === '') {
    return null;
  }

  return { clientId, clientSecret };
}

export function createDriveSyncIO(input: {
  config: DriveClientConfig;
  layout: DataLayout;
  /** Reused as-is: it already holds a string encrypted through safeStorage. */
  vault: TokenVault;
  backupService: BackupService;
  openExternal: (url: string) => Promise<void>;
  log: (line: string) => void;
}): DriveSyncIO {
  const { config, layout, vault, backupService, openExternal, log } = input;

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
    ensureFresh: (tokens) => drive.ensureFresh(config, tokens),
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
