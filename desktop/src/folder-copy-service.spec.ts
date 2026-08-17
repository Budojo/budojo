import { describe, expect, it, vi } from 'vitest';

import type { BackupEntry } from './backup.js';
import { emptyFolderState, FolderCopyService, type FolderCopyIO, type FolderCopyState } from './folder-copy-service.js';
import type { FolderFile } from './folder-copy.js';

/**
 * The orchestration (#1320). What is pinned here is the order things happen in
 * and what happens when they fail — the folder belongs to the owner, and the
 * unacceptable outcomes are a deleted file that was not ours and a crashed main
 * process.
 */

const archive = (name: string, sizeBytes = 100): BackupEntry => ({
  name,
  path: `/backups/${name}`,
  createdAt: '2026-08-17T09:00:00.000Z',
  sizeBytes,
});

function fakeIO(overrides: Partial<FolderCopyIO> = {}) {
  const state: { current: FolderCopyState } = {
    current: { ...emptyFolderState(), folder: 'D:/OneDrive/Budojo' },
  };

  const io: FolderCopyIO = {
    readState: vi.fn(async () => state.current),
    writeState: vi.fn(async (next: FolderCopyState) => {
      state.current = next;
    }),
    listFolder: vi.fn(async () => [] as FolderFile[]),
    copyInto: vi.fn(async () => undefined),
    deleteFrom: vi.fn(async () => undefined),
    localArchives: vi.fn(async () => [] as BackupEntry[]),
    log: vi.fn(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };

  return { io, state };
}

describe('copy', () => {
  it('does nothing at all when no folder has been chosen', async () => {
    const { io } = fakeIO({ readState: vi.fn(async () => emptyFolderState()) });

    const result = await new FolderCopyService(io, 7).copy();

    expect(result).toEqual({ ran: false, reason: 'no_folder' });
    expect(io.listFolder).not.toHaveBeenCalled();
    expect(io.copyInto).not.toHaveBeenCalled();
  });

  it('copies an archive the folder is missing', async () => {
    const { io } = fakeIO({ localArchives: vi.fn(async () => [archive('budojo-backup-20260817-090000.zip')]) });

    const result = await new FolderCopyService(io, 7).copy();

    expect(result).toMatchObject({ ran: true, copied: 1 });
    expect(io.copyInto).toHaveBeenCalledWith(
      '/backups/budojo-backup-20260817-090000.zip',
      'D:/OneDrive/Budojo',
      'budojo-backup-20260817-090000.zip',
    );
  });

  // Pruning first could delete the only copy over there and then fail to write
  // its replacement.
  it('copies before it prunes', async () => {
    const order: string[] = [];
    const present = Array.from({ length: 9 }, (_, i) => ({
      name: `budojo-backup-2026080${i}-090000.zip`,
      sizeBytes: 100,
    }));

    const { io } = fakeIO({
      localArchives: vi.fn(async () => [archive('budojo-backup-20260817-090000.zip')]),
      listFolder: vi.fn(async () => present),
      copyInto: vi.fn(async () => {
        order.push('copy');
      }),
      deleteFrom: vi.fn(async () => {
        order.push('delete');
      }),
    });

    await new FolderCopyService(io, 7).copy();

    expect(order[0]).toBe('copy');
    expect(order).toContain('delete');
  });

  it('records a success even when nothing needed copying', async () => {
    const { io, state } = fakeIO();

    await new FolderCopyService(io, 7).copy();

    expect(state.current.lastCopyAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(state.current.lastError).toBeNull();
  });

  it('records the failure without throwing when the folder is gone', async () => {
    const { io, state } = fakeIO({
      listFolder: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }),
    });

    const result = await new FolderCopyService(io, 7).copy();

    expect(result).toMatchObject({ ran: true, error: 'ENOENT' });
    expect(state.current.lastError).toBe('ENOENT');
  });

  it('keeps the last successful copy time when a later attempt fails', async () => {
    const { io, state } = fakeIO({
      copyInto: vi.fn(async () => {
        throw Object.assign(new Error('full'), { code: 'ENOSPC' });
      }),
      localArchives: vi.fn(async () => [archive('budojo-backup-20260817-090000.zip')]),
    });
    state.current = { ...state.current, lastCopyAt: '2026-08-16T09:00:00.000Z' };

    await new FolderCopyService(io, 7).copy();

    expect(state.current.lastCopyAt).toBe('2026-08-16T09:00:00.000Z');
    expect(state.current.lastError).toBe('ENOSPC');
  });

  it('does not throw when reading the state fails', async () => {
    const { io } = fakeIO({
      readState: vi.fn(async () => {
        throw Object.assign(new Error('nope'), { code: 'EPERM' });
      }),
    });

    await expect(new FolderCopyService(io, 7).copy()).resolves.toMatchObject({ ran: true, error: 'EPERM' });
  });

  // It is the owner's folder. Deleting something we did not create would be the
  // worst thing this feature could do.
  it('never deletes a file it did not create', async () => {
    const { io } = fakeIO({
      listFolder: vi.fn(async () => [
        { name: 'taxes-2025.pdf', sizeBytes: 10 },
        { name: 'holiday.jpg', sizeBytes: 10 },
      ]),
    });

    await new FolderCopyService(io, 1).copy();

    expect(io.deleteFrom).not.toHaveBeenCalled();
  });
});

describe('setFolder', () => {
  it('stores the folder and clears any previous error', async () => {
    const { io, state } = fakeIO();
    state.current = { ...state.current, lastError: 'ENOENT' };

    const next = await new FolderCopyService(io, 7).setFolder('E:/Backups');

    expect(next.folder).toBe('E:/Backups');
    expect(state.current.lastError).toBeNull();
  });

  it('clearing the folder stops all copying', async () => {
    const { io } = fakeIO({ localArchives: vi.fn(async () => [archive('a')]) });
    const service = new FolderCopyService(io, 7);

    await service.setFolder(null);
    const result = await service.copy();

    expect(result).toEqual({ ran: false, reason: 'no_folder' });
    expect(io.copyInto).not.toHaveBeenCalled();
  });
});
