import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface NotificationActor {
  readonly name: string;
  readonly avatar_url: string | null;
}

export interface InboxNotification {
  readonly id: string;
  readonly type: string;
  /** Stable category discriminator (e.g. `community_reaction_on_your_post`) — drives the type badge. */
  readonly kind?: string | null;
  readonly title: string;
  readonly body: string;
  readonly link: string | null;
  /** Who triggered it (for the avatar). Null/absent for system notifications (recap, payment, …). */
  readonly actor?: NotificationActor | null;
  readonly read_at: string | null;
  /** When the owner archived it (#1914), or null while it is in "Da vedere". */
  readonly archived_at?: string | null;
  readonly created_at: string | null;
}

interface ListResponse {
  readonly data: readonly InboxNotification[];
  readonly meta: { readonly unread_count: number };
}

interface MarkOneResponse {
  readonly data: { readonly id: string; readonly read_at: string | null };
}

interface MarkAllResponse {
  readonly data: { readonly marked_read: number };
}

/**
 * In-app notification inbox surface (#418). Backs the bell-icon
 * dropdown in the dashboard topbar. Keeps a signal of the latest 20
 * rows + the unread count so the badge updates in lockstep with
 * mark-as-read calls.
 */
@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/me/notifications`;

  private readonly _rows = signal<readonly InboxNotification[]>([]);
  private readonly _unread = signal<number>(0);
  private readonly _loaded = signal<boolean>(false);

  readonly rows = this._rows.asReadonly();
  readonly unread = this._unread.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly hasUnread = computed(() => this._unread() > 0);

  load(): Observable<ListResponse> {
    return this.http.get<ListResponse>(this.base).pipe(
      tap((r) => {
        this._rows.set(r.data);
        this._unread.set(r.meta.unread_count);
        this._loaded.set(true);
      }),
    );
  }

  markAsRead(id: string): Observable<MarkOneResponse> {
    return this.http.post<MarkOneResponse>(`${this.base}/${id}/read`, {}).pipe(
      tap((r) => {
        // Decrement unread ONLY when the local row was previously
        // unread — without this guard, two clicks in rapid succession
        // (or a click on an already-read row) drift the badge below
        // the truthful count. The local-state pre-image is the
        // load-bearing check; we don't trust the server response shape
        // beyond the read_at value it carries.
        const wasUnread = this._rows().some((n) => n.id === r.data.id && n.read_at === null);
        this._rows.set(
          this._rows().map((n) => (n.id === r.data.id ? { ...n, read_at: r.data.read_at } : n)),
        );
        if (wasUnread && r.data.read_at !== null) {
          this._unread.update((v) => Math.max(0, v - 1));
        }
      }),
    );
  }

  /**
   * Out of "Da vedere", into "Archiviate" (#1914). The row leaves the inbox
   * at once; an unread one stops counting on the bell with it.
   */
  archive(id: string): Observable<void> {
    return this.http.post(`${this.base}/${id}/archive`, {}).pipe(
      tap(() => {
        const wasUnread = this._rows().some((n) => n.id === id && n.read_at === null);
        this._rows.set(this._rows().filter((n) => n.id !== id));
        if (wasUnread) {
          this._unread.update((v) => Math.max(0, v - 1));
        }
      }),
      map(() => undefined),
    );
  }

  /** Back into "Da vedere" (#1914). The caller reloads the inbox to put it in its place. */
  unarchive(id: string): Observable<void> {
    return this.http.post(`${this.base}/${id}/unarchive`, {}).pipe(map(() => undefined));
  }

  /**
   * "Archivia le lette" (#1914): every read row, in one request. Resolves to
   * the ids it took, so the page can offer them back.
   */
  archiveRead(): Observable<string[]> {
    // The server's ids, not the loaded rows': it archives every read row,
    // including those past the twenty on screen, and "Annulla" must bring
    // back all of them.
    return this.http
      .post<{ data: { archived: number; ids: string[] } }>(`${this.base}/archive-read`, {})
      .pipe(
        tap(() => this._rows.set(this._rows().filter((n) => n.read_at === null))),
        map((r) => r.data.ids),
      );
  }

  /** "Annulla" for a batch (#1914): one request, however many rows it took. */
  unarchiveMany(ids: readonly string[]): Observable<void> {
    return this.http.post(`${this.base}/unarchive`, { ids }).pipe(map(() => undefined));
  }

  /** "Archiviate" (#1914): not cached — it is read when the owner opens it. */
  listArchived(): Observable<readonly InboxNotification[]> {
    return this.http
      .get<ListResponse>(this.base, { params: { archived: '1' } })
      .pipe(map((r) => r.data));
  }

  markAllAsRead(): Observable<number> {
    return this.http.post<MarkAllResponse>(`${this.base}/read-all`, {}).pipe(
      tap(() => {
        const now = new Date().toISOString();
        this._rows.set(this._rows().map((n) => (n.read_at === null ? { ...n, read_at: now } : n)));
        this._unread.set(0);
      }),
      map((r) => r.data.marked_read),
    );
  }
}
