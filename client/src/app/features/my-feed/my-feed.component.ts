import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, catchError, of, switchMap } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { TranslateService } from '@ngx-translate/core';
import {
  CommunityFeedPage,
  CommunityPost,
  CommunityService,
  ReactionEmoji,
  ReactionToggleResponse,
} from '../../core/services/community.service';
import type { Belt } from '../../core/services/athlete.service';
import { BeltBadgeComponent } from '../../shared/components/belt-badge/belt-badge.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { UserFlairComponent } from '../../shared/components/user-flair/user-flair.component';
import { CommentsThreadComponent } from './comments-thread/comments-thread.component';

/**
 * Athlete-portal community timeline (#614, M9 PR-B2). Consumes the
 * `/api/v1/community/feed` endpoint shipped in #612 and renders posts
 * descending by created-at.
 *
 * V1 renders three post types:
 *
 * - `belt_promotion` — auto-emitted celebration with a 🎉 prefix +
 *   athlete name + belt-badge transition.
 * - `event` — title + start time + (optional) location text.
 * - `owner_announcement` — plain body text with the author's flair
 *   line.
 *
 * Reactions, comments, RSVPs counters are surfaced but not actionable
 * yet (PR-C/D/E). The author flair (name · @handle · belt) is rendered
 * inline; the dedicated `<app-user-flair>` component lands with PR-D
 * when comments need the same shape in two places (Rule of Three / DRY).
 */
@Component({
  selector: 'app-my-feed',
  standalone: true,
  imports: [
    TranslatePipe,
    DatePipe,
    SkeletonModule,
    ToastModule,
    BeltBadgeComponent,
    UserAvatarComponent,
    UserFlairComponent,
    CommentsThreadComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  templateUrl: './my-feed.component.html',
  styleUrl: './my-feed.component.scss',
})
export class MyFeedComponent implements OnInit {
  private readonly communityService = inject(CommunityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  protected readonly posts = signal<readonly CommunityPost[]>([]);
  protected readonly loading = signal(true);
  protected readonly currentPage = signal(1);
  protected readonly lastPage = signal(1);
  protected readonly loadError = signal(false);

  /**
   * Pagination request stream piped through `switchMap` so a rapid
   * prev / next click cancels the in-flight HTTP request and only the
   * latest response wins. Without this, a slow network can reorder
   * responses and overwrite a newer page with stale data (Copilot
   * review on #614).
   */
  private readonly pageRequests = new Subject<number>();

  ngOnInit(): void {
    // `catchError` inside `switchMap` keeps the outer stream alive
    // when a single request fails — otherwise the first HTTP error
    // would terminate the subscription and break every subsequent
    // page-change click.
    this.pageRequests
      .pipe(
        switchMap((page) =>
          this.communityService
            .getFeed(page)
            .pipe(catchError(() => of<CommunityFeedPage | null>(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (response === null) {
          this.posts.set([]);
          this.loading.set(false);
          this.loadError.set(true);
          return;
        }
        this.posts.set(response.data);
        this.currentPage.set(response.meta.current_page);
        this.lastPage.set(response.meta.last_page);
        this.loading.set(false);
      });

    this.load(1);
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.pageRequests.next(page);
  }

  protected nextPage(): void {
    if (this.currentPage() < this.lastPage()) {
      this.load(this.currentPage() + 1);
    }
  }

  protected previousPage(): void {
    if (this.currentPage() > 1) {
      this.load(this.currentPage() - 1);
    }
  }

  protected beltOf(post: CommunityPost, field: 'old_belt' | 'new_belt'): Belt | null {
    const raw = post.payload[field];
    return typeof raw === 'string' ? (raw as Belt) : null;
  }

  protected athleteNameOf(post: CommunityPost): string {
    const raw = post.payload['athlete_name'];
    return typeof raw === 'string' ? raw : '';
  }

  protected eventTitle(post: CommunityPost): string {
    const raw = post.payload['title'];
    return typeof raw === 'string' ? raw : '';
  }

  protected eventStartsAt(post: CommunityPost): string | null {
    const raw = post.payload['starts_at'];
    return typeof raw === 'string' ? raw : null;
  }

  protected eventLocation(post: CommunityPost): string | null {
    const raw = post.payload['location_text'];
    return typeof raw === 'string' ? raw : null;
  }

  protected announcementBody(post: CommunityPost): string {
    const raw = post.payload['body'];
    return typeof raw === 'string' ? raw : '';
  }

  /**
   * Per-post toggle streams (#617, PR-C2). Rapid clicks on the SAME
   * post are serialized through `switchMap` so only the latest
   * request wins — without this, a fast clap→pray→clap can land out
   * of order and leave the SPA reflecting the wrong emoji (Copilot
   * review on PR #619). Different posts get independent Subjects
   * (they don't share a race surface), kept in this map.
   */
  private readonly reactionStreams = new Map<
    number,
    {
      readonly subject: Subject<{ emoji: ReactionEmoji; rollback: () => void }>;
    }
  >();

  /**
   * Optimistic reaction toggle (#617, PR-C2). Updates the local
   * signal immediately so the user sees feedback in < 100ms (Doherty
   * threshold), then fires the API call through the per-post
   * `switchMap` stream. On error, rolls back to the pre-click state
   * and shows a toast. On success, reconciles to the server's
   * canonical state in case our optimistic prediction diverged
   * (e.g., another tab in the same session toggled in between).
   */
  protected toggleReaction(post: CommunityPost, emoji: ReactionEmoji): void {
    const previousReaction = post.your_reaction;
    const previousCount = post.reactions_count;

    const optimistic = this.predictNextState(post, emoji);
    this.replacePost(post.id, optimistic);

    const stream = this.streamFor(post.id);
    stream.next({
      emoji,
      rollback: () => {
        this.replacePost(post.id, {
          your_reaction: previousReaction,
          reactions_count: previousCount,
        });
      },
    });
  }

  private streamFor(postId: number): Subject<{ emoji: ReactionEmoji; rollback: () => void }> {
    const existing = this.reactionStreams.get(postId);
    if (existing) {
      return existing.subject;
    }

    const subject = new Subject<{ emoji: ReactionEmoji; rollback: () => void }>();
    subject
      .pipe(
        // switchMap cancels any in-flight HTTP for the same post when
        // a new click arrives — only the latest response can update
        // the signal, so out-of-order arrivals can't poison the state.
        switchMap(({ emoji, rollback }) =>
          this.communityService.toggleReaction(postId, emoji).pipe(
            catchError(() => {
              rollback();
              this.messageService.add({
                severity: 'error',
                summary: this.translateService.instant('athletePortal.feed.reactToastError'),
                life: 3000,
              });
              return of<ReactionToggleResponse | null>(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (response === null) return;
        const total = response.counts.clap + response.counts.pray;
        this.replacePost(postId, {
          your_reaction: response.your_reaction,
          reactions_count: total,
        });
      });

    this.reactionStreams.set(postId, { subject });
    return subject;
  }

  private predictNextState(
    post: CommunityPost,
    emoji: ReactionEmoji,
  ): { your_reaction: ReactionEmoji | null; reactions_count: number } {
    if (post.your_reaction === null) {
      return { your_reaction: emoji, reactions_count: post.reactions_count + 1 };
    }
    if (post.your_reaction === emoji) {
      return { your_reaction: null, reactions_count: Math.max(0, post.reactions_count - 1) };
    }
    // Different emoji — swap in place; count unchanged.
    return { your_reaction: emoji, reactions_count: post.reactions_count };
  }

  private replacePost(
    postId: number,
    patch: { your_reaction: ReactionEmoji | null; reactions_count: number },
  ): void {
    this.posts.update((list) =>
      list.map((p) =>
        p.id === postId
          ? { ...p, your_reaction: patch.your_reaction, reactions_count: patch.reactions_count }
          : p,
      ),
    );
  }

  /**
   * Per-post comments-thread expand state. The thread mounts lazily
   * on first toggle so the feed paint stays cheap when no card is
   * open. Stored as a Set rather than a boolean per-post object so
   * the signal update is shallow + cheap.
   */
  private readonly expandedThreads = signal(new Set<number>());

  protected isThreadOpen(postId: number): boolean {
    return this.expandedThreads().has(postId);
  }

  protected toggleThread(postId: number): void {
    this.expandedThreads.update((s) => {
      const next = new Set(s);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  /**
   * Patches the parent feed's `comments_count` for a single post
   * when a child thread emits a create / delete delta — keeps the
   * counter pill on the feed card honest without re-fetching the
   * whole feed (Copilot review on PR #623).
   */
  protected onCommentCountDelta(postId: number, delta: number): void {
    this.posts.update((list) =>
      list.map((p) =>
        p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count + delta) } : p,
      ),
    );
  }
}
