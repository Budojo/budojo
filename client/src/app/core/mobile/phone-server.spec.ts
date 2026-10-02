import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  bootPhoneServer,
  phoneServerInterceptor,
  PhpServerPlugin,
  phpServerPlugin,
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
    const plugin: PhpServerPlugin = { start: vi.fn(async () => ({ port: 41234 })) };
    const screen = document.createElement('app-root');
    document.body.append(screen);

    const started = await bootPhoneServer(plugin, screen);

    expect(started).toBe(true);
    expect(window.__BUDOJO_MOBILE__).toEqual({ apiBase: 'http://127.0.0.1:41234' });
  });

  it('shows that it is starting while the server boots', async () => {
    let release: () => void = () => undefined;
    const plugin: PhpServerPlugin = {
      start: () =>
        new Promise((resolve) => {
          release = () => resolve({ port: 1 });
        }),
    };
    const screen = document.createElement('app-root');

    const booting = bootPhoneServer(plugin, screen);

    expect(screen.textContent).toMatch(/Budojo/);
    release();
    await booting;
  });

  it('shows what went wrong on screen when the server does not start: the screen is the only log', async () => {
    const plugin: PhpServerPlugin = {
      start: vi.fn(async () => {
        throw new Error('IOException: libphp.so is missing\n--- php-server.log\nnothing');
      }),
    };
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

    it('starts it again and repeats the request once, so the screen shows no error', async () => {
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
