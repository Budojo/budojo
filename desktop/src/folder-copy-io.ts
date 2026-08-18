import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BackupService } from './backup.js';
import type { DataLayout } from './bootstrap.js';
import { emptyFolderState, type FolderCopyIO, type FolderCopyState } from './folder-copy-service.js';
import type { FolderFile } from './folder-copy.js';

/**
 * The real I/O behind the folder copy (#1320). No decisions here — those live
 * in `folder-copy.ts` and `folder-copy-service.ts`, where they are tested.
 */

/** Never throws: a corrupt state file resets to "no folder chosen" rather than blocking a boot. */
function parse(raw: string): FolderCopyState {
  try {
    const parsed = JSON.parse(raw) as Partial<FolderCopyState>;

    return {
      folder: typeof parsed.folder === 'string' && parsed.folder !== '' ? parsed.folder : null,
      lastCopyAt: typeof parsed.lastCopyAt === 'string' ? parsed.lastCopyAt : null,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
      lastErrorAt: typeof parsed.lastErrorAt === 'string' ? parsed.lastErrorAt : null,
    };
  } catch {
    return emptyFolderState();
  }
}

export function createFolderCopyIO(input: {
  layout: DataLayout;
  backupService: BackupService;
  log: (line: string) => void;
}): FolderCopyIO {
  const { layout, backupService, log } = input;

  return {
    readState: async () => {
      try {
        return parse(await readFile(layout.backupFolderStateFile, 'utf8'));
      } catch {
        return emptyFolderState();
      }
    },

    writeState: async (state) => {
      await writeFile(layout.backupFolderStateFile, JSON.stringify(state, null, 2), 'utf8');
    },

    // Deliberately allowed to throw: a folder that has been deleted, unplugged
    // or made read-only is exactly what the caller needs to hear about, and the
    // errno is what turns into a sentence the owner can act on.
    listFolder: async (folder): Promise<FolderFile[]> => {
      const entries = await readdir(folder, { withFileTypes: true });
      const files: FolderFile[] = [];

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        const { size } = await stat(path.join(folder, entry.name));
        files.push({ name: entry.name, sizeBytes: size });
      }

      return files;
    },

    copyInto: async (sourcePath, folder, name) => {
      // The owner may have picked a folder that does not exist yet, and a
      // sync client can remove an empty one under us.
      await mkdir(folder, { recursive: true });

      // Write beside the target, then rename. A copy interrupted halfway would
      // otherwise leave a truncated archive under the real name — which looks
      // like a backup and is not one, the exact failure the size check exists
      // to catch. Rename within a directory is atomic on both platforms.
      const finalPath = path.join(folder, name);
      const partial = `${finalPath}.partial`;

      await copyFile(sourcePath, partial);
      await rm(finalPath, { force: true });
      const { rename } = await import('node:fs/promises');
      await rename(partial, finalPath);
    },

    deleteFrom: async (folder, name) => {
      await rm(path.join(folder, name), { force: true });
    },

    localArchives: () => backupService.list(),
    log,
    now: () => Date.now(),
  };
}
