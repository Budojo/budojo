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
export type CommunityPostType =
  | 'belt_promotion'
  | 'stripe_promotion'
  | 'event'
  | 'owner_announcement'
  | 'shared_video';
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
  /**
   * Per-emoji breakdown so the SPA renders the right count next to
   * each reaction button. Total of `clap + pray` equals
   * `reactions_count`. Server populates from aliased withCount;
   * defaults to `{ clap: 0, pray: 0 }` on a freshly-created post.
   */
  readonly reaction_counts: {
    readonly clap: number;
    readonly pray: number;
  };
  readonly comments_count: number;
  readonly rsvps_count: number;
  readonly going_rsvps_count: number;
  readonly maybe_rsvps_count: number;
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
   * List every reaction on a post with the reactor's identity flair
   * (post-v2.9.0, "voglio vedere chi ha messo cosa"). The SPA opens
   * a bottom-sheet (mobile) / dialog (desktop) on tap of the count
   * next to the 👏 / 🙏 buttons. Paginated 20/page.
   */
  listReactions(postId: number, page = 1): Observable<PostReactionsPage> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<PostReactionsPage>(`${this.base}/posts/${postId}/reactions`, { params });
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

  /**
   * Create an event-type community post (M9 PR-G client, owner-only).
   * Mirrors the body shape of `POST /api/v1/community/events`:
   * `title` + `starts_at` required, the rest optional. The server
   * re-serialises `starts_at` to canonical UTC ISO 8601 and writes
   * the standard `community_posts.payload` shape, including
   * `location_address: null` for the V2 map view.
   *
   * Normalisation happens HERE so every caller (today the composer,
   * tomorrow an admin tool / automated import) gets the same wire
   * shape: trim every string, convert blank-after-trim optionals to
   * `null`. Copilot review on #640 flagged the duplication risk.
   *
   * The endpoint returns the full `CommunityPostResource` so the SPA
   * can prepend it to the local feed without a follow-up roundtrip.
   */
  createEvent(payload: CreateEventPayload): Observable<CommunityPost> {
    const normalised: CreateEventPayload = {
      title: payload.title.trim(),
      starts_at: payload.starts_at,
      description: blankToNull(payload.description),
      location_text: blankToNull(payload.location_text),
      location_lat: payload.location_lat ?? null,
      location_lon: payload.location_lon ?? null,
      max_attendees: payload.max_attendees ?? null,
    };
    return this.http
      .post<{ data: CommunityPost }>(`${this.base}/events`, normalised)
      .pipe(map((res) => res.data));
  }

  /**
   * Share an external technique video (#1155) — Instagram / YouTube /
   * TikTok. The server resolves the preview from the allowlisted provider
   * and returns the full `shared_video` post so the SPA can prepend it to
   * the feed. A 422 means the URL isn't an allowlisted provider or its
   * preview couldn't be resolved.
   */
  createSharedVideo(payload: CreateSharedVideoPayload): Observable<CommunityPost> {
    return this.http
      .post<{ data: CommunityPost }>(`${this.base}/videos`, {
        url: payload.url.trim(),
        caption: blankToNull(payload.caption),
      })
      .pipe(map((res) => res.data));
  }
}

/** Trim + collapse empty / whitespace-only strings to `null`. */
function blankToNull(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Wire shape for `POST /api/v1/community/events`. Mirrors the server-
 * side `CreateEventRequest` rules; the SPA composer is the only
 * caller today (`POST` exposed since v2.7.0).
 */
/** Wire shape for one row in the post-reactions list (post-v2.9.0). */
export interface PostReactionItem {
  readonly id: number;
  readonly emoji: ReactionEmoji;
  /**
   * `created_at` is stamped by Eloquent on insert and the column is
   * NOT NULL at the schema level; nullable here only as a defensive
   * type guard for the unlikely model-without-timestamp case.
   */
  readonly created_at: string | null;
  readonly user: CommunityPostAuthor;
}

export interface PostReactionsPage {
  readonly data: readonly PostReactionItem[];
  readonly meta: {
    readonly current_page: number;
    readonly per_page: number;
    readonly total: number;
    readonly last_page: number;
  };
}

export interface CreateEventPayload {
  readonly title: string;
  readonly starts_at: string;
  readonly description?: string | null;
  readonly location_text?: string | null;
  readonly location_lat?: number | null;
  readonly location_lon?: number | null;
  readonly max_attendees?: number | null;
}

export interface CreateSharedVideoPayload {
  readonly url: string;
  readonly caption: string | null;
}
