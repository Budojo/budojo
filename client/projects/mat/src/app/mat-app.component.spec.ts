import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideI18nTesting } from '../../../../src/test-utils/i18n-test';
import { KEY_VALUE_STORE, KeyValueStore } from './key-value-store';
import { MatAppComponent } from './mat-app.component';

/** A Map standing in for IndexedDB, which jsdom does not have. */
class MemoryStore implements KeyValueStore {
  readonly entries = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.entries.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.entries.set(key, value);
  }
}

describe('MatAppComponent (the #2027 spike screen)', () => {
  let store: MemoryStore;

  async function render(): Promise<ComponentFixture<MatAppComponent>> {
    const fixture = TestBed.createComponent(MatAppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<MatAppComponent>, cy: string): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(`[data-cy="${cy}"]`)?.textContent ?? ''
    ).trim();
  }

  beforeEach(() => {
    store = new MemoryStore();
    TestBed.configureTestingModule({
      imports: [MatAppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        { provide: KEY_VALUE_STORE, useValue: store },
      ],
    });
  });

  it('starts at zero and says nothing was saved yet', async () => {
    const fixture = await render();

    expect(text(fixture, 'mat-count')).toBe('0');
    expect(text(fixture, 'mat-saved-at')).toBe('Nothing saved yet.');
  });

  it('reads back what an earlier install saved', async () => {
    store.entries.set('spike-count', { count: 7, savedAt: '2026-09-28T19:30:00.000Z' });

    const fixture = await render();

    expect(text(fixture, 'mat-count')).toBe('7');
    expect(text(fixture, 'mat-saved-at')).toContain('Last saved');
  });

  it('saves every tap before showing it', async () => {
    const fixture = await render();

    (
      fixture.nativeElement.querySelector('[data-cy="mat-increment"] button') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.entries.get('spike-count')).toEqual(expect.objectContaining({ count: 1 }));
    expect(text(fixture, 'mat-count')).toBe('1');
  });

  it('says the server test runs only in the app, in a browser', async () => {
    const fixture = await render();

    expect(text(fixture, 'mat-server-unavailable')).toBe('Only available in the app on the phone.');
  });

  describe('inside the app (#2044)', () => {
    const holder = globalThis as { Capacitor?: unknown };

    afterEach(() => {
      delete holder.Capacitor;
      vi.unstubAllGlobals();
    });

    it('starts the server, then shows the cold start and the measurements', async () => {
      holder.Capacitor = {
        Plugins: {
          PhpServer: {
            start: async () => ({
              port: 41234,
              totalMs: 1800,
              unpackMs: 900,
              migrateMs: 400,
              serverMs: 500,
              firstRequestMs: 160,
              opcache: 'file-cache',
              extracted: true,
              seeded: true,
              demoEmail: 'admin@example.it',
              demoPassword: 'x',
            }),
          },
        },
      };
      vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        const body = input.endsWith('/auth/login')
          ? { token: 't' }
          : input.endsWith('/athletes')
            ? { data: [{ id: 1 }], meta: { total: 40 } }
            : input.includes('/attendance?')
              ? { data: [] }
              : input.endsWith('/attendance')
                ? { data: [{ id: 5 }] }
                : { status: 'ok' };
        return new Response(JSON.stringify(body), { status: 200 });
      });
      const fixture = await render();

      (
        fixture.nativeElement.querySelector(
          '[data-cy="mat-server-run"] button',
        ) as HTMLButtonElement
      ).click();
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const results = text(fixture, 'mat-server-results');
      expect(results).toContain('1800 ms');
      expect(results).toContain('First request');
      expect(results).toContain('160 ms');
      expect(results).toContain('file-cache');
      expect(results).toContain('Athletes in the database');
      expect(results).toContain('40');
    });
  });

  it('says the Drive test runs only in the app, in a browser', async () => {
    const fixture = await render();

    expect(text(fixture, 'mat-drive-unavailable')).toBe('Only available in the app on the phone.');
  });

  describe('Google Drive inside the app (#2028)', () => {
    const holder = globalThis as { Capacitor?: unknown; CapacitorWebFetch?: unknown };
    let authorize: ReturnType<typeof vi.fn>;

    function plug(firstAnswer: 'granted' | 'needs-consent'): void {
      authorize = vi.fn(async ({ interactive }: { interactive: boolean }) => {
        if (firstAnswer === 'needs-consent' && !interactive) {
          throw Object.assign(new Error("Google needs the owner's consent"), {
            code: 'NEEDS_CONSENT',
          });
        }
        return { accessToken: 'tok', grantedScopes: [], consented: interactive, ms: 120 };
      });
      holder.Capacitor = {
        Plugins: {
          DriveAuth: {
            status: async () => ({ playServices: 'ok' }),
            authorize,
            clearToken: async () => undefined,
          },
        },
      };
    }

    afterEach(() => {
      delete holder.Capacitor;
      delete holder.CapacitorWebFetch;
    });

    /** The launch connection is three awaits deep: let them all land before reading the screen. */
    async function settle(fixture: ComponentFixture<MatAppComponent>): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }

    it('connects silently at launch, which is the reboot test', async () => {
      plug('granted');

      const fixture = await render();
      await settle(fixture);

      expect(authorize).toHaveBeenCalledWith({ interactive: false });
      expect(text(fixture, 'mat-drive-link')).toContain('Connected without asking (120 ms)');
      expect(text(fixture, 'mat-drive-link')).toContain('ok');
    });

    it('offers the consent screen when Google has no grant yet', async () => {
      plug('needs-consent');
      const fixture = await render();
      await settle(fixture);
      expect(text(fixture, 'mat-drive-link')).toContain('Not connected yet');

      (
        fixture.nativeElement.querySelector(
          '[data-cy="mat-drive-connect"] button',
        ) as HTMLButtonElement
      ).click();
      await settle(fixture);

      expect(authorize).toHaveBeenLastCalledWith({ interactive: true });
      expect(text(fixture, 'mat-drive-link')).toContain("Connected, after Google's consent");
    });

    it('runs the probe and remembers that the phone wrote its file', async () => {
      plug('granted');
      holder.CapacitorWebFetch = async (url: string) => {
        if (url.includes('/about?')) {
          return Response.json({ user: { emailAddress: 'owner@example.it' } });
        }
        if (url.includes('/upload/')) {
          return Response.json({ id: 'phone-1' });
        }
        if (url.includes('alt=media')) {
          return new Response(
            'Budojo: prova di Google Drive dal telefono (#2028). Non è un backup e si può cancellare.\n',
          );
        }
        const query = new URL(url).searchParams.get('q') ?? '';
        return Response.json({ files: query.startsWith("name='Budojo'") ? [{ id: 'f' }] : [] });
      };
      const fixture = await render();
      await settle(fixture);

      (
        fixture.nativeElement.querySelector('[data-cy="mat-drive-run"] button') as HTMLButtonElement
      ).click();
      await settle(fixture);

      const results = text(fixture, 'mat-drive-results');
      expect(results).toContain('owner@example.it');
      expect(results).toContain('Found');
      expect(results).toContain('Written now');
      expect(store.entries.get('spike-drive-written')).toBe(true);
      expect(text(fixture, 'mat-drive-next')).toContain('1 January 2000');
    });
  });

  it('draws the sample row with the belt spine, and says it is a sample', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-athlete-identity')?.textContent).toContain('Luca Bianchi');
    expect(host.textContent).toContain('A sample row');
  });
});
