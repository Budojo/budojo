import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';

/**
 * Where the token lives (#1227): localStorage on the web, the encrypted
 * keychain bridge inside Budojo Desktop.
 */
describe('TokenStorageService', () => {
  type BridgeWindow = Window & { __BUDOJO__?: unknown };
  const bridgeWindow = window as BridgeWindow;

  afterEach(() => {
    delete bridgeWindow.__BUDOJO__;
    localStorage.clear();
  });

  function service(): TokenStorageService {
    TestBed.configureTestingModule({});
    return TestBed.inject(TokenStorageService);
  }

  describe('web (no bridge)', () => {
    it('reads, writes and clears localStorage', () => {
      const store = service();

      expect(store.get()).toBeNull();
      store.set('1|web-token');
      expect(localStorage.getItem('auth_token')).toBe('1|web-token');
      expect(store.get()).toBe('1|web-token');
      store.clear();
      expect(store.get()).toBeNull();
    });
  });

  describe('desktop (bridge present)', () => {
    it('goes through the bridge and never touches localStorage', () => {
      let vault: string | null = null;
      bridgeWindow.__BUDOJO__ = {
        apiBase: '',
        platform: 'win32',
        onNavigate: () => () => undefined,
        token: {
          get: () => vault,
          set: (t: string) => {
            vault = t;
          },
          clear: () => {
            vault = null;
          },
        },
      };
      const store = service();

      store.set('1|desktop-token');
      expect(store.get()).toBe('1|desktop-token');
      expect(localStorage.getItem('auth_token')).toBeNull();
      store.clear();
      expect(store.get()).toBeNull();
    });
  });
});
