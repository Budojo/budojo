import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';

/** Requests that change nothing: never held, never a reason to push. */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The academy's API on this device's own server. */
const API = /\/api\/v1\//;

/**
 * The sync's own requests, which run while the writes are held: the server's
 * sync API, and the session the swap opens again on the database it brought
 * in (`/device/session`). Nothing else of `/device/`: a restore the door
 * starts while a round finishes waits like any write. Nor the owner's
 * answers to what a rebase set aside (`/sync/conflicts`): page writes,
 * journaled, which a swap must never miss and the sync pushes like any.
 */
const SYNC = /\/api\/v1\/(sync\/(?!conflicts)|device\/session$)/;

/**
 * The page's own writes to its server (#2046), the one writer it has:
 * - **held** while the sync checks the journal and swaps the database in
 *   (`SyncContext.holdWrites`), so no write lands on a database about to be
 *   replaced. A hold waits for the writes already sent to finish first;
 * - **told to the sync** once the server took one, so it pushes a few
 *   seconds later (PRD § 5.2).
 *
 * **Reads wait too while the sync swaps** (#2032), and a hold waits for those
 * already sent: on the PC the server goes down for the restart, and a read
 * that found it down would show the offline page; one sent before the owner's
 * session was open again would carry a token the new database never had.
 * Only writes tell the sync to push.
 *
 * **Once a hold has replaced the database, no write goes through again**: the
 * ones it held and every later one fail, until the page loads again, which
 * the sync does next. They were made against the page's view of the database
 * it had: after a rebase, athlete 4 there can be another athlete here.
 */
@Injectable({ providedIn: 'root' })
export class WriteGate {
  private inFlight = 0;
  private idleWaiters: (() => void)[] = [];
  private held: Promise<void> | null = null;
  /** The database was replaced under a hold: writes fail until the page loads again. */
  private replaced = false;
  private readonly landed = new Subject<void>();

  /** A write the server answered with success. */
  readonly written$ = this.landed.asObservable();

  /** `replaced` says, once `work` is over, whether it swapped the database in. */
  async hold<T>(work: () => Promise<T>, replaced: () => boolean = () => false): Promise<T> {
    if (this.held !== null) {
      throw new Error('the writes are held already: sync rounds never overlap');
    }
    let release = (): void => undefined;
    this.held = new Promise<void>((resolve) => (release = resolve));
    try {
      await this.idle();
      return await work();
    } finally {
      this.replaced ||= replaced();
      this.held = null;
      release();
    }
  }

  /**
   * Sends `send()` once nothing holds the writes, counted from then until it
   * ends. The check and the count are one step, so a hold that starts later
   * always waits for it.
   */
  pass<T>(
    send: () => Observable<T>,
    succeeded: (value: T) => boolean,
    refused: (() => unknown) | null = null,
  ): Observable<T> {
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
        if (this.replaced && refused !== null) {
          subscriber.error(refused());
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

/**
 * Every request to the academy's API goes through the gate, the sync's own
 * aside: writes counted, so a hold waits for them, and reads only held.
 */
export const writeGateInterceptor: HttpInterceptorFn = (req, next) => {
  if (!API.test(req.url) || SYNC.test(req.url)) {
    return next(req);
  }
  const write = !READS.has(req.method);
  return inject(WriteGate).pass<HttpEvent<unknown>>(
    () => next(req),
    (event) => write && event instanceof HttpResponse,
    write
      ? () =>
          // No message of its own: each form says, in the owner's language,
          // that the save did not go through, and the page loads again.
          new HttpErrorResponse({ status: 409, statusText: 'Conflict', url: req.urlWithParams })
      : null,
  );
};
