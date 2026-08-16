import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { DesktopBridgeService } from './desktop-bridge.service';
import { stubBridge } from '../../../test-utils/bridge-test';

/**
 * Renderer side of the Electron bridge (#1225): a clicked native toast asks
 * the SPA to navigate; on the web there is no bridge and nothing happens.
 */
describe('DesktopBridgeService', () => {
  type BridgeWindow = Window & { __BUDOJO__?: unknown };
  const bridgeWindow = window as BridgeWindow;

  const noToken = { get: () => null, set: () => undefined, clear: () => undefined };
  const noBackup = {
    list: async () => [],
    run: async () => ({ ok: false, path: null }),
    restore: async () => ({ ok: false }),
  };
  const noKeys = {
    export: async () => ({ ok: false }),
    import: async () => ({ ok: false }),
  };

  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
  });

  function setup(): { service: DesktopBridgeService; navigate: ReturnType<typeof vi.spyOn> } {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    return { service: TestBed.inject(DesktopBridgeService), navigate };
  }

  it('is a no-op on the web, where the bridge does not exist', () => {
    const { service, navigate } = setup();

    expect(service.isDesktop).toBe(false);
    expect(() => service.startNavigationRelay()).not.toThrow();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('routes to the path a clicked toast asks for', () => {
    let deliver: ((path: string) => void) | null = null;
    const unsubscribe = vi.fn();
    bridgeWindow.__BUDOJO__ = stubBridge({
      apiBase: 'http://127.0.0.1:1',
      platform: 'win32',
      onNavigate: (callback: (path: string) => void) => {
        deliver = callback;
        return unsubscribe;
      },
      token: noToken,
      backup: noBackup,
      keys: noKeys,
    });
    const { service, navigate } = setup();

    service.startNavigationRelay();
    expect(service.isDesktop).toBe(true);

    deliver!('/dashboard/documents/expiring');

    expect(navigate).toHaveBeenCalledWith('/dashboard/documents/expiring');
  });

  it('unsubscribes when the injector is destroyed', () => {
    const unsubscribe = vi.fn();
    bridgeWindow.__BUDOJO__ = stubBridge({
      apiBase: '',
      platform: 'win32',
      onNavigate: () => unsubscribe,
      token: noToken,
      backup: noBackup,
      keys: noKeys,
    });
    const { service } = setup();

    service.startNavigationRelay();
    TestBed.resetTestingModule();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
