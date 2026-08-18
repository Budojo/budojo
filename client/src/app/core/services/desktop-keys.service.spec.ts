import { TestBed } from '@angular/core/testing';
import { DesktopKeysService } from './desktop-keys.service';
import { stubBridge } from '../../../test-utils/bridge-test';

/**
 * Renderer side of the recovery-key bridge (#1254): passthrough on the desktop,
 * a hidden no-op on the web.
 */
describe('DesktopKeysService', () => {
  type BridgeWindow = Window & { __BUDOJO__?: unknown };
  const bridgeWindow = window as BridgeWindow;

  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
  });

  function service(): DesktopKeysService {
    TestBed.configureTestingModule({});
    return TestBed.inject(DesktopKeysService);
  }

  it('reports unavailable and returns safe defaults on the web', async () => {
    const svc = service();

    expect(svc.available).toBe(false);
    expect(await svc.reveal()).toEqual({
      ok: false,
      reason: 'Recovery keys are only available in the desktop app.',
    });
    expect(await svc.importCode('x')).toEqual({
      ok: false,
      reason: 'Recovery keys are only available in the desktop app.',
    });
  });

  it('passes through to the bridge on the desktop', async () => {
    const keys = {
      export: vi.fn(async () => ({ ok: true, code: 'BUDOJO-RECOVERY-1:abc' })),
      import: vi.fn(async () => ({ ok: true })),
    };
    bridgeWindow.__BUDOJO__ = stubBridge({
      apiBase: '',
      platform: 'win32',
      onNavigate: () => () => undefined,
      token: { get: () => null, set: () => undefined, clear: () => undefined },
      backup: {
        list: async () => [],
        run: async () => ({ ok: false, path: null }),
        restore: async () => ({ ok: false }),
      },
      keys,
    });
    const svc = service();

    expect(svc.available).toBe(true);
    expect(await svc.reveal()).toEqual({ ok: true, code: 'BUDOJO-RECOVERY-1:abc' });
    expect(await svc.importCode('BUDOJO-RECOVERY-1:abc')).toEqual({ ok: true });
    expect(keys.import).toHaveBeenCalledWith('BUDOJO-RECOVERY-1:abc');
  });
});
