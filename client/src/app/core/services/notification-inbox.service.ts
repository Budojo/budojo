import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface InboxNotification {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly link: string | null;
  readonly read_at: string | null;
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
        this._rows.set(
          this._rows().map((n) => (n.id === r.data.id ? { ...n, read_at: r.data.read_at } : n)),
        );
        // Decrement unread iff this was the row's first read flip.
        this._unread.update((v) => Math.max(0, v - 1));
      }),
    );
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
