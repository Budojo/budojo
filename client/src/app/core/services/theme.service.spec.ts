import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

/**
 * A fake `MediaQueryList` we can flip, because the whole point of `system`
 * is that it keeps following after boot (#1793).
 */
function fakeMatchMedia(initiallyDark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches: initiallyDark,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: () => undefined,
  };
  return {
    matchMedia: () => mql,
    /** Flip the OS setting the way a sunset does. */
    flip(dark: boolean): void {
      mql.matches = dark;
      listeners.forEach((cb) => cb({ matches: dark }));
    },
    listenerCount: () => listeners.length,
  };
}

function setup(opts: { stored?: string | null; osDark?: boolean } = {}) {
  const os = fakeMatchMedia(opts.osDark ?? false);
  const root = document.documentElement;
  root.classList.remove('dark');
  root.style.colorScheme = '';

  localStorage.clear();
  if (opts.stored != null) localStorage.setItem('budojoTheme', opts.stored);

  // `matchMedia` lives on the document's default view, which is what the
  // service reads through Angular's DOCUMENT token. Defined rather than
  // spied: the test environment does not implement it at all, so there is no
  // function for `vi.spyOn` to wrap.
  //
  // And DEFINED rather than assigned. A plain `window.matchMedia = …` threw
  // `Cannot assign to read only property` depending on which spec file shared
  // the worker: `web-push.service.spec.ts` installs its own with
  // `Object.defineProperty(…, { configurable: true })`, and a descriptor
  // without `writable` defaults to read-only. It only ever failed on the
  // orderings where that file ran first, which reads exactly like a flake and
  // is not one. `defineProperty` overwrites whatever is there, whatever its
  // descriptor says.
  Object.defineProperty(window, 'matchMedia', {
    value: os.matchMedia,
    configurable: true,
    writable: true,
  });

  TestBed.configureTestingModule({});
  const service = TestBed.inject(ThemeService);
  service.bootstrap();

  return { service, os, root };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
});

describe('ThemeService (#1793)', () => {
  describe('the default is to follow the system', () => {
    it('resolves dark when the OS asks for dark, with nothing stored', () => {
      const { service, root } = setup({ osDark: true });

      expect(service.preference()).toBe('system');
      expect(service.resolved()).toBe('dark');
      expect(root.classList.contains('dark')).toBe(true);
      // Without this the browser keeps painting white scrollbars and native
      // form controls on a dark app.
      expect(root.style.colorScheme).toBe('dark');
    });

    it('resolves light when the OS asks for light', () => {
      const { service, root } = setup({ osDark: false });

      expect(service.resolved()).toBe('light');
      expect(root.classList.contains('dark')).toBe(false);
    });

    it('keeps following when the OS flips, with no reload', () => {
      const { service, os, root } = setup({ osDark: false });
      expect(service.resolved()).toBe('light');

      os.flip(true);

      // This is the entire reason `system` is a value rather than the
      // absence of one: at sunset the app follows.
      expect(service.resolved()).toBe('dark');
      expect(root.classList.contains('dark')).toBe(true);
    });

    it('does not write the inferred preference back to storage', () => {
      setup({ osDark: true });

      // Same rule as the language service: an inferred preference stays
      // inferred, so installing on a new device reads that device's setting
      // instead of replaying an old machine's guess.
      expect(localStorage.getItem('budojoTheme')).toBeNull();
    });
  });

  describe('an explicit choice wins, and sticks', () => {
    it('overrides the OS', () => {
      const { service, root } = setup({ osDark: true });

      service.setPreference('light');

      expect(service.resolved()).toBe('light');
      expect(root.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('budojoTheme')).toBe('light');
    });

    it('stops following the OS while it is set', () => {
      const { service, os } = setup({ osDark: false });
      service.setPreference('light');

      os.flip(true);

      expect(service.resolved()).toBe('light');
    });

    it('survives a restart', () => {
      const { service } = setup({ stored: 'dark', osDark: false });

      expect(service.preference()).toBe('dark');
      expect(service.resolved()).toBe('dark');
    });

    it('returns to following the OS when set back to system', () => {
      const { service, os } = setup({ stored: 'light', osDark: true });
      expect(service.resolved()).toBe('light');

      service.setPreference('system');

      expect(service.resolved()).toBe('dark');
      os.flip(false);
      expect(service.resolved()).toBe('light');
    });
  });

  describe('the desktop title bar follows too', () => {
    /**
     * The native window chrome is the one surface the `.dark` class cannot
     * reach: Windows paints it from a value handed to Electron, so it has to
     * be pushed. Without this, picking Dark left a #fafafa bar welded across
     * the top of a near-black app — permanently, on the only platform that
     * ships.
     */
    function withBridge() {
      const apply = vi.fn(async () => ({ ok: true }));
      (window as unknown as { __BUDOJO__: unknown }).__BUDOJO__ = { theme: { apply } };

      return apply;
    }

    afterEach(() => {
      delete (window as unknown as { __BUDOJO__?: unknown }).__BUDOJO__;
    });

    it('pushes the resolved theme on boot', () => {
      const apply = withBridge();

      setup({ osDark: true });

      expect(apply).toHaveBeenCalledWith('dark');
    });

    it('pushes the resolved theme, never the preference', () => {
      const apply = withBridge();
      const { service } = setup({ stored: 'dark', osDark: false });
      apply.mockClear();

      service.setPreference('system');

      // `system` is a question the SPA has already answered; the shell has no
      // business answering it a second time and differently.
      expect(apply).toHaveBeenCalledWith('light');
      expect(apply).not.toHaveBeenCalledWith('system');
    });

    it('pushes again when the OS flips under `system`', () => {
      const apply = withBridge();
      const { os } = setup({ osDark: false });
      apply.mockClear();

      os.flip(true);

      // At sunset the app goes dark and the title bar has to go with it.
      expect(apply).toHaveBeenCalledWith('dark');
    });
  });

  describe('bad input and hostile environments', () => {
    it('ignores a stored value that is not a preference', () => {
      const { service } = setup({ stored: 'solarized', osDark: true });

      // Falls through to `system` rather than to a hardcoded light, so a
      // corrupted key does not also lose the OS setting.
      expect(service.preference()).toBe('system');
      expect(service.resolved()).toBe('dark');
    });

    it('refuses to set a preference it does not support', () => {
      const { service } = setup();

      service.setPreference('sepia' as never);

      expect(service.preference()).toBe('system');
      expect(localStorage.getItem('budojoTheme')).toBeNull();
    });

    it('still resolves when matchMedia is missing', () => {
      localStorage.clear();
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      TestBed.configureTestingModule({});
      const service = TestBed.inject(ThemeService);

      expect(() => service.bootstrap()).not.toThrow();
      // No signal from the OS is not dark; it is light, which is what the
      // app has always shipped.
      expect(service.resolved()).toBe('light');
    });

    it('sets up even when a previous spec file left a read-only matchMedia', () => {
      // This is the ordering that failed in CI and passed on every re-run.
      // `web-push.service.spec.ts` installs its own `matchMedia` with a
      // descriptor that omits `writable`, which defaults to read-only, and
      // did not remove it afterwards — so on the orderings where it shared a
      // worker and ran first, `setup()` threw before asserting anything.
      Object.defineProperty(window, 'matchMedia', {
        value: () => ({ matches: false }),
        configurable: true,
      });

      expect(() => setup({ osDark: true })).not.toThrow();
    });

    it('survives a desktop shell that predates the theme channel', () => {
      // `window.__BUDOJO__` is injected by a preload script — a separate build
      // artefact — so its TypeScript type is a claim, not a guarantee. An
      // older shell has no `theme` key, and `?.theme.apply` would throw right
      // through `bootstrap()` and take the whole app's boot with it.
      (window as unknown as { __BUDOJO__: unknown }).__BUDOJO__ = { apiBase: '' };

      const { service } = setup({ osDark: true });

      expect(service.resolved()).toBe('dark');
      delete (window as unknown as { __BUDOJO__?: unknown }).__BUDOJO__;
    });

    it('applies the theme even when localStorage throws on write', () => {
      const { service, root } = setup({ osDark: false });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      service.setPreference('dark');

      // Safari private mode throws outright. The theme still applies for
      // this session; it just will not be remembered.
      expect(service.resolved()).toBe('dark');
      expect(root.classList.contains('dark')).toBe(true);
    });
  });
});
