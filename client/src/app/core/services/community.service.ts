import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Belt } from './athlete.service';

/**
 * Wire shape mirror of the server's `CommunityPostResource` (#612).
 * Source of truth is `docs/api/v1.yaml § /community/feed`; bump both
 * sides together when the shape changes.
 *
 * `type` discriminates `payload` — V1 ships three values:
 *
 * - `belt_promotion` — emitted automatically by the AthleteObserver
 *   when an athlete's belt column changes. Payload carries the
 *   athlete id + old/new belt + the promotion timestamp.
 * - `event` — owner-authored open mat / seminar / grading. Payload
 *   has title + start time + optional location (RSVP UI lands in PR-E).
 * - `owner_announcement` — generic owner-side broadcast.
 *
 * `created_by.belt` is null for owner-authored posts (only athletes
 * carry a belt); the SPA's flair component switches variant on that.
 */
export type CommunityPostType = 'belt_promotion' | 'event' | 'owner_announcement';
export type CommunityPostVisibility = 'academy' | 'public';

export interface CommunityPostAuthor {
  readonly id: number;
  readonly first_name: string;
  readonly last_name: string;
  readonly full_name: string;
  readonly handle: string | null;
  readonly avatar_url: string | null;
  readonly belt: Belt | null;
}

export interface CommunityPost {
  readonly id: number;
  readonly type: CommunityPostType;
  readonly visibility: CommunityPostVisibility;
  readonly payload: Record<string, unknown>;
  readonly created_at: string;
  readonly created_by: CommunityPostAuthor;
  readonly reactions_count: number;
  readonly comments_count: number;
  readonly rsvps_count: number;
}

export interface CommunityFeedPage {
  readonly data: readonly CommunityPost[];
  readonly meta: {
    readonly current_page: number;
    readonly per_page: number;
    readonly total: number;
    readonly last_page: number;
  };
}

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/community`;

  getFeed(page = 1): Observable<CommunityFeedPage> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<CommunityFeedPage>(`${this.base}/feed`, { params });
  }

  deletePost(postId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/posts/${postId}`);
  }
}
