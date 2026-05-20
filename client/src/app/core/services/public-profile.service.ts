import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE_REDIRECT } from '../http/skip-offline-redirect';
import { Belt } from './athlete.service';

/**
 * Public-profile snapshot (#862, M9 social-profile epic slice A).
 *
 * Sourced from `GET /api/v1/users/{handle}/profile`. The server enforces
 * three gates that all collapse to 404 (no existence leak):
 *
 *  1. Handle is unknown.
 *  2. The target opted out (`profile_is_public = false`).
 *  3. Cross-academy peer.
 */
export type PublicProfilePromotionKind = 'belt' | 'stripe';

export interface PublicProfilePromotion {
  id: number;
  kind: PublicProfilePromotionKind;
  from_belt: Belt | null;
  to_belt: Belt | null;
  from_stripes: number | null;
  to_stripes: number | null;
  belt_at_event: Belt | null;
  recorded_at: string;
}

export interface PublicProfile {
  id: number;
  first_name: string;
  handle: string;
  avatar_url: string | null;
  belt: Belt | null;
  joined_at: string | null;
  promotions: PublicProfilePromotion[];
}

interface PublicProfileEnvelope {
  data: PublicProfile;
}

@Injectable({ providedIn: 'root' })
export class PublicProfileService {
  private readonly http = inject(HttpClient);

  get(handle: string): Observable<PublicProfile> {
    return new Observable<PublicProfile>((subscriber) => {
      const sub = this.http
        .get<PublicProfileEnvelope>(`${environment.apiBase}/api/v1/users/${handle}/profile`)
        .subscribe({
          next: (env) => {
            subscriber.next(env.data);
            subscriber.complete();
          },
          error: (err) => subscriber.error(err),
        });
      return () => sub.unsubscribe();
    });
  }

  /**
   * Variant that opts the request out of the global offline-detection
   * redirect — used by surfaces that fetch the profile in response to a
   * tap (Slice B feed tagging) so a transient 404 / blip never navigates
   * the user away from their feed. See
   * [[feedback_background_polls_skip_offline_redirect]].
   */
  getSilent(handle: string): Observable<PublicProfile> {
    return new Observable<PublicProfile>((subscriber) => {
      const context = new HttpContext().set(SKIP_OFFLINE_REDIRECT, true);
      const sub = this.http
        .get<PublicProfileEnvelope>(`${environment.apiBase}/api/v1/users/${handle}/profile`, {
          context,
        })
        .subscribe({
          next: (env) => {
            subscriber.next(env.data);
            subscriber.complete();
          },
          error: (err) => subscriber.error(err),
        });
      return () => sub.unsubscribe();
    });
  }
}
