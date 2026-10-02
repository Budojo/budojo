import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';

/** Requests that change nothing: never held, never a reason to push. */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The academy's API on this device's own server. */
const API = /\/api\/v1\//;

/**
 * The sync's own requests, which run while the writes are held: the server's
 * sync API, and the session the swap opens again on the database it brought
 * in (`/device/session`).
 */
const SYNC = /\/api\/v1\/(sync|device)\//;

/**
 * The page's own writes to its server (#2046), the one writer it has:
 * - **held** while the sync checks the journal and swaps the database in
 *   (`SyncContext.holdWrites`), so no write lands on a database about to be
 *   replaced. A hold waits for the writes already sent to finish first;
 * - **told to the sync** once the server took one, so it pushes a few
 *   seconds later (PRD § 5.2).
 */
@Injectable({ providedIn: 'root' })
export class WriteGate {
  private inFlight = 0;
  private idleWaiters: (() => void)[] = [];
  private held: Promise<void> | null = null;
  private readonly landed = new Subject<void>();

  /** A write the server answered with success. */
  readonly written$ = this.landed.asObservable();

  async hold<T>(work: () => Promise<T>): Promise<T> {
    if (this.held !== null) {
      throw new Error('the writes are held already: sync rounds never overlap');
    }
    let release = (): void => undefined;
    this.held = new Promise<void>((resolve) => (release = resolve));
    try {
      await this.idle();
      return await work();
    } finally {
      this.held = null;
      release();
    }
  }

  /**
   * Sends `send()` once nothing holds the writes, counted from then until it
   * ends. The check and the count are one step, so a hold that starts later
   * always waits for it.
   */
  pass<T>(send: () => Observable<T>, succeeded: (value: T) => boolean): Observable<T> {
    return new Observable<T>((subscriber) => {
      let closed = false;
      let admitted = false;
      let ok = false;
      let inner: Subscription | null = null;
      const go = (): void => {
        if (closed) {
          return;
        }
        if (this.held !== null) {
          void this.held.then(go);
          return;
        }
        this.inFlight++;
        admitted = true;
        inner = send().subscribe({
          next: (value) => {
            ok ||= succeeded(value);
            subscriber.next(value);
          },
          error: (error: unknown) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      };
      go();
      return () => {
        closed = true;
        inner?.unsubscribe();
        if (admitted) {
          this.leave(ok);
        }
      };
    });
  }

  private leave(ok: boolean): void {
    this.inFlight--;
    if (ok) {
      this.landed.next();
    }
    if (this.inFlight === 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  private idle(): Promise<void> {
    return this.inFlight === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }
}

/** Every write to the academy's API goes through the gate; reads and the sync's own requests do not. */
export const writeGateInterceptor: HttpInterceptorFn = (req, next) => {
  if (READS.has(req.method) || !API.test(req.url) || SYNC.test(req.url)) {
    return next(req);
  }
  return inject(WriteGate).pass<HttpEvent<unknown>>(
    () => next(req),
    (event) => event instanceof HttpResponse,
  );
};
