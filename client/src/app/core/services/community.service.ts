import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
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
export type ReactionEmoji = 'clap' | 'pray';
export type RsvpResponse = 'going' | 'maybe';

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
  readonly your_reaction: ReactionEmoji | null;
  readonly your_rsvp: RsvpResponse | null;
}

export interface ReactionToggleResponse {
  readonly your_reaction: ReactionEmoji | null;
  readonly counts: {
    readonly clap: number;
    readonly pray: number;
  };
}

export interface RsvpToggleResponse {
  readonly your_rsvp: RsvpResponse | null;
  readonly counts: {
    readonly going: number;
    readonly maybe: number;
  };
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

/**
 * 1-level comment on a community post (M9 PR-D). Mirrors
 * `PostCommentResource` server-side. `created_by` carries the same
 * identity flair shape as posts, so the SPA routes both surfaces
 * through `<app-user-flair>`.
 */
export interface PostComment {
  readonly id: number;
  readonly post_id: number;
  readonly body: string;
  readonly created_at: string;
  readonly created_by: CommunityPostAuthor;
}

export interface CommentsPage {
  readonly data: readonly PostComment[];
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

  /**
   * Toggle the authenticated user's emoji reaction on a post (#617,
   * PR-C2). The server runs same-emoji-toggles-off / different-emoji-
   * swaps-in-place semantics and returns the resulting state, which
   * the caller uses to reconcile its optimistic update.
   */
  toggleReaction(postId: number, emoji: ReactionEmoji): Observable<ReactionToggleResponse> {
    return this.http.post<ReactionToggleResponse>(`${this.base}/posts/${postId}/reactions`, {
      emoji,
    });
  }

  /**
   * List the comments under a post (#604, M9 PR-D2 client). 50/page,
   * ascending-created-at — the natural thread read order.
   */
  listComments(postId: number, page = 1): Observable<CommentsPage> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<CommentsPage>(`${this.base}/posts/${postId}/comments`, { params });
  }

  /**
   * Post a 1-level comment under a post. Body is trimmed + capped at
   * 500 chars server-side; the SPA defensively re-trims before
   * sending.
   */
  createComment(postId: number, body: string): Observable<PostComment> {
    return this.http
      .post<{ data: PostComment }>(`${this.base}/posts/${postId}/comments`, {
        body: body.trim(),
      })
      .pipe(map((res) => res.data));
  }

  /**
   * Soft-delete a comment. Server authorizes when the caller is the
   * author OR the owner of the post's academy.
   */
  deleteComment(commentId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/comments/${commentId}`);
  }

  /**
   * Toggle the caller's RSVP on an event-type post (#605, PR-E2).
   * Same-response toggles off, different-response swaps in place.
   * Returns the resulting state for SPA optimistic-update
   * reconciliation.
   */
  toggleRsvp(postId: number, response: RsvpResponse): Observable<RsvpToggleResponse> {
    return this.http.post<RsvpToggleResponse>(`${this.base}/posts/${postId}/rsvp`, { response });
  }
}
