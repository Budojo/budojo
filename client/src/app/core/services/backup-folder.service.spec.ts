import { TestBed } from '@angular/core/testing';

import { stubBridge } from '../../../test-utils/bridge-test';
import { BackupFolderService } from './backup-folder.service';

/**
 * Renderer side of the backup-folder bridge (#1320). Pure passthrough, so what
 * matters is that it never throws when the bridge is absent — the Backup page
 * calls it while rendering, and taking the page down to hide one card would be
 * the wrong trade.
 */
describe('BackupFolderService', () => {
  type BridgeWindow = Window & { __BUDOJO__?: unknown };
  const bridgeWindow = window as BridgeWindow;

  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
  });

  function service(): BackupFolderService {
    TestBed.configureTestingModule({});

    return TestBed.inject(BackupFolderService);
  }

  function withFolder(folder: Partial<NonNullable<Window['__BUDOJO__']>['folder']>): void {
    bridgeWindow.__BUDOJO__ = stubBridge({ folder });
  }

  describe('outside the desktop app', () => {
    it('reports itself unavailable', () => {
      expect(service().available).toBe(false);
    });

    it('reports no folder rather than throwing', async () => {
      await expect(service().state()).resolves.toMatchObject({ folder: null });
    });

    it('refuses to choose instead of failing silently', async () => {
      await expect(service().choose()).resolves.toEqual({ ok: false });
    });
  });

  describe('inside the desktop app', () => {
    it('passes the chosen folder through', async () => {
      withFolder({
        state: () =>
          Promise.resolve({
            folder: 'D:/OneDrive/Budojo',
            lastCopyAt: '2026-08-17T09:00:00Z',
            lastError: null,
            lastErrorAt: null,
          }),
      });

      await expect(service().state()).resolves.toMatchObject({ folder: 'D:/OneDrive/Budojo' });
    });

    it('reports a cancelled picker as not ok, not as an error', async () => {
      withFolder({ choose: () => Promise.resolve({ ok: false }) });

      await expect(service().choose()).resolves.toEqual({ ok: false });
    });

    it('passes clear through', async () => {
      let called = false;
      withFolder({
        clear: () => {
          called = true;

          return Promise.resolve({ ok: true });
        },
      });

      await service().clear();

      expect(called).toBe(true);
    });

    it('surfaces a copy failure code', async () => {
      withFolder({ copy: () => Promise.resolve({ ran: true, copied: 0, error: 'ENOSPC' }) });

      await expect(service().copyNow()).resolves.toMatchObject({ error: 'ENOSPC' });
    });
  });
});
