import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Wire shape for the user's per-category opt-out state (#416). Keys
 * are category identifiers from `App\Support\NotificationCategory`;
 * values are booleans (`true` = enabled, `false` = opted out).
 */
export type NotificationPreferences = Record<string, boolean>;

interface SnapshotResponse {
  readonly data: NotificationPreferences;
}

/**
 * HTTP surface for the email-notification preferences panel on
 * `/dashboard/profile` (#416). Read + partial-write over
 * `users.notification_preferences`; the panel renders one switch per
 * known category and PATCHes the diff on user toggle.
 */
@Injectable({ providedIn: 'root' })
export class NotificationPreferencesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/me/notification-preferences`;

  show(): Observable<NotificationPreferences> {
    return this.http.get<SnapshotResponse>(this.base).pipe(map((r) => r.data));
  }

  /**
   * PATCH a partial map of `{category: bool}`. The server merges
   * with the existing JSON column and echoes the full snapshot back
   * so the caller can refresh local state without a follow-up GET.
   */
  update(patch: NotificationPreferences): Observable<NotificationPreferences> {
    return this.http
      .patch<SnapshotResponse>(this.base, { preferences: patch })
      .pipe(map((r) => r.data));
  }
}
