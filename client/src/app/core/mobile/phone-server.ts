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
  /**
   * What lets this page, and nothing else on the phone, open the owner's
   * session and bring a backup in (#2079). Made by the shell at each launch.
   */
  shellSecret?: string;
}

export interface PhpServerPlugin {
  /** Starts the server, or answers at once when it is already running. Never two at a time. */
  start(): Promise<PhpServerStart>;
  /** Stops and starts it, so a database just staged is swapped in now (#2079). */
  restart(): Promise<PhpServerStart>;
  /**
   * Takes the academy's keys from the Google account (#2033), for the
   * server's next start: the two app keys, and with the sync key and the
   * folder id the phone joins the academy's sync and makes its device id, once
   * (#2046). Whether anything changed.
   */
  adoptKeys(keys: {
    APP_KEY: string;
    DOCUMENT_ENCRYPTION_KEY: string;
    syncKey?: string;
    folder?: string;
  }): Promise<{ changed: boolean }>;
  /** The phone's place in the academy's sync; empty until it joined (#2046). */
  syncIdentity(): Promise<{ device?: string; folder?: string; syncKey?: string }>;
}

/** The plugin when the page runs inside the Android app; null anywhere else. */
export function phpServerPlugin(): PhpServerPlugin | null {
  const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (capacitor?.Plugins?.['PhpServer'] as PhpServerPlugin | undefined) ?? null;
}

/** Tells the app where its server is, and returns that address. */
function publish(start: PhpServerStart): string {
  const apiBase = `http://127.0.0.1:${start.port}`;
  window.__BUDOJO_MOBILE__ = { apiBase, shellSecret: start.shellSecret };
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

/** The server's address, whichever port a request was built with. */
const LOCAL_SERVER = /^http:\/\/127\.0\.0\.1:\d+/;

/** The shell's own requests, which a restart's `after` is made of: never held. */
const SHELL_ONLY = /\/api\/v1\/device\//;

/** Requests that change nothing, so sending one twice is harmless. */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** While the server is being started again after the app came back: settles once it answers. */
let returning: Promise<unknown> | null = null;

function ensureRunning(plugin: PhpServerPlugin): void {
  const ready = plugin.start().then(publish, () => undefined);
  returning = ready;
  void ready.then(() => {
    if (returning === ready) {
      returning = null;
    }
  });
}

/**
 * Restarts the server so that what the page just staged is swapped in (#2079),
 * holding every request meanwhile, as a return from the background does.
 *
 * With `after`, the requests stay held until it is done too: the sync opens the
 * owner's session again on the database it swapped in (#2046), and a request
 * let go before that would carry a token the new database never had. The
 * shell's own requests (`/device/*`) are never held: `after` is made of them.
 */
export async function restartPhoneServer(
  plugin: PhpServerPlugin,
  after: () => Promise<void> = async () => undefined,
): Promise<void> {
  const ready = plugin
    .restart()
    .then(publish)
    .then(() => after());
  // The held requests go once it settles, whichever way: a failure is the
  // caller's to report, not every request's.
  const settled = ready.then(
    () => undefined,
    () => undefined,
  );
  returning = settled;
  try {
    await ready;
  } finally {
    if (returning === settled) {
      returning = null;
    }
  }
}

/**
 * Android can kill the server while the app sits in the background (the
 * phantom process killer, Android 12+). When the app comes back, this starts
 * it again and holds the page's requests, writes included, until it answers:
 * the owner's first tap waits a moment instead of failing. Returns the way to
 * stop listening.
 */
export function holdRequestsOnReturn(plugin: PhpServerPlugin, doc: Document): () => void {
  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') {
      ensureRunning(plugin);
    }
  };
  doc.addEventListener('visibilitychange', onVisibility);
  return () => doc.removeEventListener('visibilitychange', onVisibility);
}

/**
 * The page's side of the server's restarts. Every request to the server goes
 * to its current address, because services keep the one they were built with
 * and the server may have moved to another port meanwhile.
 *
 * A request that finds nobody listening starts the server again. A read is
 * then repeated once: the owner sees a slower answer, not an error. A write
 * is not, because "no answer" cannot tell a server that never got it from one
 * that saved it and died before answering; it fails with its own error, and
 * the next tap finds the server running.
 */
export const phoneServerInterceptor: HttpInterceptorFn = (req, next) => {
  if (window.__BUDOJO_MOBILE__ === undefined || !LOCAL_SERVER.test(req.url)) {
    return next(req);
  }
  const send = () => {
    const apiBase = window.__BUDOJO_MOBILE__?.apiBase ?? '';
    return next(req.clone({ url: req.url.replace(LOCAL_SERVER, apiBase) }));
  };
  const sent =
    returning === null || SHELL_ONLY.test(req.url) ? send() : from(returning).pipe(switchMap(send));
  return sent.pipe(
    catchError((error: unknown) => {
      const plugin = phpServerPlugin();
      if (!(error instanceof HttpErrorResponse) || error.status !== 0 || plugin === null) {
        return throwError(() => error);
      }
      if (!READS.has(req.method)) {
        ensureRunning(plugin);
        return throwError(() => error);
      }
      return from(plugin.start()).pipe(
        catchError(() => throwError(() => error)),
        switchMap((start) => {
          publish(start);
          return send();
        }),
      );
    }),
  );
};
