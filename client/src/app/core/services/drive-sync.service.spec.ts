import { TestBed } from '@angular/core/testing';

import { stubBridge } from '../../../test-utils/bridge-test';
import { DriveSyncService } from './drive-sync.service';

/**
 * Renderer side of the Drive backup bridge (#1301).
 *
 * Pure passthrough, so what is worth pinning is how it behaves when the bridge
 * is NOT there — on the web, and in a desktop build that ships no OAuth client.
 * Both are normal states, not errors, and neither may throw: this service is
 * called while the Backup page is rendering.
 */
describe('DriveSyncService', () => {
  type BridgeWindow = Window & { __BUDOJO__?: unknown };
  const bridgeWindow = window as BridgeWindow;

  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
  });

  function service(): DriveSyncService {
    TestBed.configureTestingModule({});

    return TestBed.inject(DriveSyncService);
  }

  function withDrive(drive: Partial<NonNullable<Window['__BUDOJO__']>['drive']>): void {
    bridgeWindow.__BUDOJO__ = stubBridge({ drive });
  }

  describe('outside the desktop app', () => {
    it('reports itself unavailable', () => {
      expect(service().available).toBe(false);
    });

    // The Backup page asks for this while rendering. Throwing here would take
    // the whole page down to hide one card.
    it('reports a not-configured, not-linked state instead of throwing', async () => {
      await expect(service().state()).resolves.toEqual({ configured: false, linked: false });
    });

    it('returns an empty archive list', async () => {
      await expect(service().archives()).resolves.toEqual([]);
    });

    it('refuses to link with a reason rather than failing silently', async () => {
      await expect(service().link()).resolves.toMatchObject({ ok: false });
    });
  });

  describe('inside the desktop app', () => {
    it('passes the link state through', async () => {
      withDrive({
        state: () => Promise.resolve({ configured: true, linked: true, account: 'gym@example.it' }),
      });

      await expect(service().state()).resolves.toMatchObject({
        linked: true,
        account: 'gym@example.it',
      });
    });

    it('is available even when no OAuth client is configured', () => {
      // The bridge exists; the feature is just unavailable. The page needs to
      // tell those two apart to explain itself.
      withDrive({ state: () => Promise.resolve({ configured: false, linked: false }) });

      expect(service().available).toBe(true);
    });

    it('passes archives through', async () => {
      const archive = {
        name: 'budojo-backup-20260816-120000.zip',
        sizeBytes: 10,
        createdAt: null,
        local: false,
        remote: true,
        remoteId: 'id-1',
      };
      withDrive({ archives: () => Promise.resolve([archive]) });

      await expect(service().archives()).resolves.toEqual([archive]);
    });

    it('surfaces the error code when linking fails', async () => {
      withDrive({ link: () => Promise.resolve({ ok: false, error: 'access_denied' }) });

      await expect(service().link()).resolves.toMatchObject({ ok: false, error: 'access_denied' });
    });

    it('passes unlink through', async () => {
      let called = false;
      withDrive({
        unlink: () => {
          called = true;

          return Promise.resolve({ ok: true });
        },
      });

      await service().unlink();

      expect(called).toBe(true);
    });

    it('passes a manual sync through', async () => {
      withDrive({ sync: () => Promise.resolve({ ran: true, uploaded: 2, deleted: 0 }) });

      await expect(service().syncNow()).resolves.toMatchObject({ ran: true, uploaded: 2 });
    });
  });
});
