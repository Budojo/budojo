import { TestBed } from '@angular/core/testing';
import { DesktopBackupService } from './desktop-backup.service';

/**
 * Renderer side of the backup bridge (#1228): passthrough on the desktop, a
 * hidden no-op on the web.
 */
describe('DesktopBackupService', () => {
  type BridgeWindow = Window & { __BUDOJO__?: unknown };
  const bridgeWindow = window as BridgeWindow;

  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
  });

  function service(): DesktopBackupService {
    TestBed.configureTestingModule({});
    return TestBed.inject(DesktopBackupService);
  }

  it('reports unavailable and returns safe defaults on the web', async () => {
    const svc = service();

    expect(svc.available).toBe(false);
    expect(await svc.list()).toEqual([]);
    expect(await svc.backupNow()).toBe(false);
    expect(await svc.restore('x')).toEqual({
      ok: false,
      reason: 'Backups are only available in the desktop app.',
    });
  });

  it('passes through to the bridge on the desktop', async () => {
    const backup = {
      list: vi.fn(async () => [{ name: 'a.zip', path: '/b/a.zip', createdAt: 'x', sizeBytes: 5 }]),
      run: vi.fn(async () => ({ ok: true, path: '/b/a.zip' })),
      restore: vi.fn(async () => ({ ok: false, reason: 'newer version' })),
    };
    bridgeWindow.__BUDOJO__ = {
      apiBase: '',
      platform: 'win32',
      onNavigate: () => () => undefined,
      token: { get: () => null, set: () => undefined, clear: () => undefined },
      backup,
    };
    const svc = service();

    expect(svc.available).toBe(true);
    expect((await svc.list())[0].name).toBe('a.zip');
    expect(await svc.backupNow()).toBe(true);
    expect(await svc.restore('a.zip')).toEqual({ ok: false, reason: 'newer version' });
    expect(backup.restore).toHaveBeenCalledWith('a.zip');
  });
});
