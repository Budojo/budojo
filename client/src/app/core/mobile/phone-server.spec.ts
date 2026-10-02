import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  bootPhoneServer,
  holdRequestsOnReturn,
  phoneServerInterceptor,
  PhpServerPlugin,
  phpServerPlugin,
  restartPhoneServer,
} from './phone-server';

/**
 * Budojo's own server on the phone (#2034): started before Angular, and
 * started again if Android killed it in the background.
 */
describe('the phone server (#2034)', () => {
  const holder = globalThis as { Capacitor?: unknown; __BUDOJO_MOBILE__?: unknown };

  afterEach(() => {
    delete holder.Capacitor;
    delete holder.__BUDOJO_MOBILE__;
    document.body.innerHTML = '';
  });

  it('finds no plugin in a browser', () => {
    expect(phpServerPlugin()).toBeNull();
  });

  it('starts the server, then publishes its address for the app', async () => {
    const plugin = {
      start: vi.fn(async () => ({ port: 41234, shellSecret: 'from-the-shell' })),
    } as unknown as PhpServerPlugin;
    const screen = document.createElement('app-root');
    document.body.append(screen);

    const started = await bootPhoneServer(plugin, screen);

    expect(started).toBe(true);
    expect(window.__BUDOJO_MOBILE__).toEqual({
      apiBase: 'http://127.0.0.1:41234',
      shellSecret: 'from-the-shell',
    });
  });

  it('restarts the server to swap in what was staged, holding requests until it answers (#2079)', async () => {
    let release: () => void = () => undefined;
    const plugin = {
      restart: vi.fn(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ port: 50001, shellSecret: 'same-launch' });
          }),
      ),
    } as unknown as PhpServerPlugin;
    window.__BUDOJO_MOBILE__ = { apiBase: 'http://127.0.0.1:41234', shellSecret: 'same-launch' };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([phoneServerInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    const restarting = restartPhoneServer(plugin);
    const answer = firstValueFrom(http.get('http://127.0.0.1:41234/api/v1/academy'));
    httpMock.expectNone(() => true);
    release();
    await restarting;
    await Promise.resolve();
    httpMock.expectOne('http://127.0.0.1:50001/api/v1/academy').flush({ data: null });

    await expect(answer).resolves.toEqual({ data: null });
    expect(window.__BUDOJO_MOBILE__?.apiBase).toBe('http://127.0.0.1:50001');
  });

  it('shows that it is starting while the server boots', async () => {
    let release: () => void = () => undefined;
    const plugin = {
      start: () =>
        new Promise((resolve) => {
          release = () => resolve({ port: 1 });
        }),
    } as unknown as PhpServerPlugin;
    const screen = document.createElement('app-root');

    const booting = bootPhoneServer(plugin, screen);

    expect(screen.textContent).toMatch(/Budojo/);
    release();
    await booting;
  });

  it('shows what went wrong on screen when the server does not start: the screen is the only log', async () => {
    const plugin = {
      start: vi.fn(async () => {
        throw new Error('IOException: libphp.so is missing\n--- php-server.log\nnothing');
      }),
    } as unknown as PhpServerPlugin;
    const screen = document.createElement('app-root');

    const started = await bootPhoneServer(plugin, screen);

    expect(started).toBe(false);
    expect(screen.querySelector('[data-cy="phone-boot-error"]')?.textContent).toContain(
      'libphp.so is missing',
    );
    expect(window.__BUDOJO_MOBILE__).toBeUndefined();
  });

  describe('when Android killed the server in the background', () => {
    let start: ReturnType<typeof vi.fn>;
    let http: HttpClient;
    let backend: HttpTestingController;

    beforeEach(() => {
      start = vi.fn(async () => ({ port: 41234 }));
      holder.Capacitor = { Plugins: { PhpServer: { start } } };
      window.__BUDOJO_MOBILE__ = { apiBase: 'http://127.0.0.1:41234' };
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([phoneServerInterceptor])),
          provideHttpClientTesting(),
        ],
      });
      http = TestBed.inject(HttpClient);
      backend = TestBed.inject(HttpTestingController);
    });

    afterEach(() => backend.verify());

    it('starts it again and repeats a read once, so the screen shows no error', async () => {
      const answer = firstValueFrom(http.get('http://127.0.0.1:41234/api/v1/athletes'));
      backend
        .expectOne('http://127.0.0.1:41234/api/v1/athletes')
        .error(new ProgressEvent('error'), { status: 0 });
      await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      backend.expectOne('http://127.0.0.1:41234/api/v1/athletes').flush({ data: [] });

      expect(await answer).toEqual({ data: [] });
    });

    it('follows the server to a new port when the old one was taken meanwhile', async () => {
      start.mockResolvedValue({ port: 41999 });
      const answer = firstValueFrom(http.get('http://127.0.0.1:41234/api/v1/athletes?page=2'));
      backend
        .expectOne('http://127.0.0.1:41234/api/v1/athletes?page=2')
        .error(new ProgressEvent('error'), { status: 0 });
      await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      backend.expectOne('http://127.0.0.1:41999/api/v1/athletes?page=2').flush({ data: [] });

      expect(await answer).toEqual({ data: [] });
      expect(window.__BUDOJO_MOBILE__).toEqual({ apiBase: 'http://127.0.0.1:41999' });
    });

    it('fails with the request’s own error when the server will not start again', async () => {
      start.mockRejectedValue(new Error('IOException: migrate failed'));
      const answer = firstValueFrom(http.get('http://127.0.0.1:41234/api/v1/athletes'));
      backend
        .expectOne('http://127.0.0.1:41234/api/v1/athletes')
        .error(new ProgressEvent('error'), { status: 0 });

      await expect(answer).rejects.toMatchObject({ status: 0 });
    });

    it('sends a request built with an old address to where the server is now', async () => {
      // Services keep the address they were built with; the server may have moved since.
      window.__BUDOJO_MOBILE__ = { apiBase: 'http://127.0.0.1:41999' };
      const answer = firstValueFrom(http.get('http://127.0.0.1:41234/api/v1/athletes'));
      backend.expectOne('http://127.0.0.1:41999/api/v1/athletes').flush({ data: [] });

      expect(await answer).toEqual({ data: [] });
    });

    it('never repeats a write: one that got no answer may have been saved', async () => {
      const answer = firstValueFrom(http.post('http://127.0.0.1:41234/api/v1/athletes', {}));
      backend
        .expectOne('http://127.0.0.1:41234/api/v1/athletes')
        .error(new ProgressEvent('error'), { status: 0 });

      await expect(answer).rejects.toMatchObject({ status: 0 });
      // The server is started again all the same, so the owner's next tap works.
      expect(start).toHaveBeenCalledTimes(1);
      backend.expectNone('http://127.0.0.1:41234/api/v1/athletes');
    });

    describe('back in the foreground', () => {
      let release: () => void;
      let stop: () => void;

      beforeEach(() => {
        start.mockImplementation(
          () =>
            new Promise((resolve) => {
              release = () => resolve({ port: 41234 });
            }),
        );
        stop = holdRequestsOnReturn({ start } as unknown as PhpServerPlugin, document);
      });

      afterEach(() => {
        stop();
        release();
      });

      it('holds every request, writes too, until the server answers again', async () => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));

        const answer = firstValueFrom(http.post('http://127.0.0.1:41234/api/v1/attendance', {}));
        await Promise.resolve();
        backend.expectNone('http://127.0.0.1:41234/api/v1/attendance');

        release();
        await vi.waitFor(() =>
          backend.expectOne('http://127.0.0.1:41234/api/v1/attendance').flush({}),
        );
        expect(await answer).toEqual({});
      });

      it('does not wait for anything when the app goes to the background', () => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(start).not.toHaveBeenCalled();
      });
    });

    it('lets a real error from the server through, untouched', async () => {
      const answer = firstValueFrom(http.get('http://127.0.0.1:41234/api/v1/athletes'));
      backend
        .expectOne('http://127.0.0.1:41234/api/v1/athletes')
        .flush({ message: 'Forbidden.' }, { status: 403, statusText: 'Forbidden' });

      await expect(answer).rejects.toMatchObject({ status: 403 });
      expect(start).not.toHaveBeenCalled();
    });

    it('does not restart anything for a request to another host', async () => {
      const answer = firstValueFrom(http.get('https://www.googleapis.com/drive/v3/about'));
      backend
        .expectOne('https://www.googleapis.com/drive/v3/about')
        .error(new ProgressEvent('error'), { status: 0 });

      await expect(answer).rejects.toMatchObject({ status: 0 });
      expect(start).not.toHaveBeenCalled();
    });

    it('repeats a request only once: a server that will not come back shows its error', async () => {
      const answer = firstValueFrom(http.get('http://127.0.0.1:41234/api/v1/athletes'));
      backend
        .expectOne('http://127.0.0.1:41234/api/v1/athletes')
        .error(new ProgressEvent('error'), { status: 0 });
      await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      backend
        .expectOne('http://127.0.0.1:41234/api/v1/athletes')
        .error(new ProgressEvent('error'), { status: 0 });

      await expect(answer).rejects.toMatchObject({ status: 0 });
      expect(start).toHaveBeenCalledTimes(1);
    });
  });
});
