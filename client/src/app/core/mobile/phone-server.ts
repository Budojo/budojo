import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';

/**
 * Budojo's own server on the phone (#2034), the phone's side of what the
 * desktop's PHP supervisor does: `PhpServerPlugin` (mobile/android) unpacks the
 * server, runs the migrations and starts `php -S` on `127.0.0.1`.
 *
 * The plugin reaches the page through Capacitor's global rather than the
 * `@capacitor/core` package, which keeps the client free of a dependency only
 * the phone needs.
 */

export interface PhpServerStart {
  port: number;
}

export interface PhpServerPlugin {
  /** Starts the server, or answers at once when it is already running. Never two at a time. */
  start(): Promise<PhpServerStart>;
}

/** The plugin when the page runs inside the Android app; null anywhere else. */
export function phpServerPlugin(): PhpServerPlugin | null {
  const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (capacitor?.Plugins?.['PhpServer'] as PhpServerPlugin | undefined) ?? null;
}

/** Tells the app where its server is, and returns that address. */
function publish(start: PhpServerStart): string {
  const apiBase = `http://127.0.0.1:${start.port}`;
  window.__BUDOJO_MOBILE__ = { apiBase };
  return apiBase;
}

/** Before Angular is up there are no translations: the phone's language decides. */
function inItalian(): boolean {
  return navigator.language.toLowerCase().startsWith('it');
}

/**
 * Starts the server before Angular boots, because every first request needs
 * its address. Meanwhile `screen` says so; if the server does not start, it
 * shows why, in full, because on a phone the screen is the only log anyone can
 * send. True when the app may boot.
 */
export async function bootPhoneServer(
  plugin: PhpServerPlugin,
  screen: HTMLElement,
): Promise<boolean> {
  screen.textContent = inItalian() ? 'Budojo si avvia…' : 'Starting Budojo…';
  try {
    publish(await plugin.start());
    return true;
  } catch (error) {
    const title = document.createElement('p');
    title.textContent = inItalian() ? 'Budojo non è partito.' : 'Budojo did not start.';
    const detail = document.createElement('pre');
    detail.setAttribute('data-cy', 'phone-boot-error');
    detail.style.whiteSpace = 'pre-wrap';
    detail.textContent = error instanceof Error ? error.message : String(error);
    screen.replaceChildren(title, detail);
    return false;
  }
}

/**
 * Android can kill the server while the app sits in the background (the
 * phantom process killer, Android 12+). The app itself lives on, so its next
 * request finds nobody listening. This starts the server again and repeats the
 * request once: the owner sees a slower answer, not an error. The server comes
 * back on the same port unless another app took it meanwhile, so the request
 * goes wherever it is now. A request that fails the second time, or whose
 * server will not start again, fails with its own error.
 */
export const phoneServerInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBase = window.__BUDOJO_MOBILE__?.apiBase;
  if (apiBase === undefined || !req.url.startsWith(apiBase)) {
    return next(req);
  }
  return next(req).pipe(
    catchError((error: unknown) => {
      const plugin = phpServerPlugin();
      if (!(error instanceof HttpErrorResponse) || error.status !== 0 || plugin === null) {
        return throwError(() => error);
      }
      return from(plugin.start()).pipe(
        catchError(() => throwError(() => error)),
        switchMap((start) =>
          next(req.clone({ url: publish(start) + req.url.slice(apiBase.length) })),
        ),
      );
    }),
  );
};
