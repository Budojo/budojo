import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  ViewChild,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, catchError, of, switchMap } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { TranslateService } from '@ngx-translate/core';
import {
  CommunityFeedPage,
  CommunityPost,
  CommunityService,
  ReactionEmoji,
  ReactionToggleResponse,
  RsvpResponse,
  RsvpToggleResponse,
} from '../../core/services/community.service';
import { AuthService } from '../../core/services/auth.service';
import { AcademyService } from '../../core/services/academy.service';
import { PromotionShareCardService } from '../../shared/services/promotion-share-card.service';
import { profileBaseForUser } from '../../shared/utils/profile-base';
import type { Belt } from '../../core/services/athlete.service';
import { BeltBadgeComponent } from '../../shared/components/belt-badge/belt-badge.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { UserFlairComponent } from '../../shared/components/user-flair/user-flair.component';
import { MentionTextComponent } from '../../shared/components/mention-text/mention-text.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { prefersReducedMotion } from '../../shared/utils/prefers-reduced-motion';
import { CommentsThreadComponent } from './comments-thread/comments-thread.component';
import { EventComposerComponent } from './event-composer/event-composer.component';
import { EventDatePipe } from '../../shared/pipes/event-date.pipe';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { ReactionsListSheetComponent } from './reactions-list-sheet/reactions-list-sheet.component';

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
    RouterLink,
    TranslatePipe,
    ButtonModule,
    SkeletonModule,
    ToastModule,
    TooltipModule,
    ConfirmDialog,
    BeltBadgeComponent,
    UserAvatarComponent,
    UserFlairComponent,
    PageHeaderComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    CommentsThreadComponent,
    EventComposerComponent,
    MentionTextComponent,
    ReactionsListSheetComponent,
    RelativeTimePipe,
    EventDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService, ConfirmationService],
  templateUrl: './my-feed.component.html',
  styleUrl: './my-feed.component.scss',
})
export class MyFeedComponent implements OnInit {
  private readonly communityService = inject(CommunityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly authService = inject(AuthService);
  private readonly academyService = inject(AcademyService);
  private readonly shareCard = inject(PromotionShareCardService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);

  /**
   * Post id to scroll to + highlight, parsed from the `#post-N` route
   * fragment that community notifications deep-link to (#1071). Set on
   * each fragment emission and cleared once consumed, so paging doesn't
   * re-trigger it while a fresh notification (a new fragment) re-arms it.
   */
  private targetPostId: number | null = null;
  protected readonly highlightedPostId = signal<number | null>(null);

  /**
   * Handle of the in-flight highlight-fade timer (#1077 reviewer). Tracked
   * so a rapid re-navigation can cancel the previous fade before scheduling
   * its own, and so a pending fade can't fire after teardown.
   */
  private fadeTimer?: ReturnType<typeof setTimeout>;

  protected readonly composerOpen = signal(false);

  /**
   * Reactions-list sheet state. Open on tap of a post's reactions
   * summary line; the sheet reads `/posts/{id}/reactions` and lists
   * every reactor with the same identity flair the feed uses.
   * `reactionsSheetPostId` is the post under the sheet — also used
   * as the "currently open" signal for the SPA.
   */
  protected readonly reactionsSheetPostId = signal<number | null>(null);
  protected readonly reactionsSheetClapCount = signal(0);
  protected readonly reactionsSheetPrayCount = signal(0);
  protected readonly reactionsSheetVisible = computed(() => this.reactionsSheetPostId() !== null);

  /**
   * Owners see a "Post event" affordance at the top of the feed; the
   * server-side endpoint is owner-gated (athletes get a 403 envelope)
   * so this gate is purely UI — hide the button athletes can't use
   * (Norman § Constraints) rather than let them click into a 403.
   */
  protected readonly canPostEvents = computed(() => this.authService.user()?.role === 'owner');

  /**
   * Owner-side moderation affordances (trash icon on each feed card,
   * trash icon on others' comments). Same gate as canPostEvents — the
   * server-side DeleteCommunityPostRequest / DeleteCommentRequest
   * both require `isOwner()` + the post's academy match. Hide UI
   * athletes can't use rather than let them click into a 403.
   */
  protected readonly canModerate = computed(() => this.authService.user()?.role === 'owner');

  protected readonly profileBase = computed<string>(() =>
    profileBaseForUser(this.authService.user()),
  );

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
    // Deep-link target from a community notification (#1071): the link is
    // `…#post-N`. Subscribe to the fragment *stream*, not the one-shot
    // snapshot — a foreground push toast (#1063) can navigate to the feed
    // the user is ALREADY viewing, and a same-route, fragment-only
    // navigation reuses this component without re-running ngOnInit. A
    // one-time snapshot read would silently ignore that hop and never
    // scroll (reviewer, #1071). On each emission parse the target, then
    // scroll now if the feed is already loaded (the re-navigation case);
    // otherwise the load handler below scrolls once the page lands.
    this.route.fragment.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((fragment) => {
      const match = fragment ? /^post-(\d+)$/.exec(fragment) : null;
      this.targetPostId = match ? Number(match[1]) : null;
      this.maybeScrollToTargetPost();
    });

    // A scheduled fade can outlive the component on a quick navigate-away;
    // cancel it on teardown so it can't write to a destroyed view.
    this.destroyRef.onDestroy(() => clearTimeout(this.fadeTimer));

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
        this.maybeScrollToTargetPost();
      });

    this.load(1);
  }

  /**
   * Scroll to + briefly highlight the notification-targeted post once
   * it's in the rendered list (#1071). Fires once per resolved target —
   * clears `targetPostId` so paging doesn't yank the user back, while a
   * fresh notification re-arms it. A no-op if the post isn't on the
   * current page (e.g. an old post past page 1); the user still lands on
   * the feed rather than a 404, which is the win.
   */
  private maybeScrollToTargetPost(): void {
    const id = this.targetPostId;
    if (id === null || !this.posts().some((p) => p.id === id)) {
      return;
    }
    this.targetPostId = null;
    this.highlightedPostId.set(id);
    // Defer to after the next render so the @for has rendered the
    // <li id="post-N"> — afterNextRender is the Angular-21-idiomatic
    // replacement for the old setTimeout(0) tick-defer (#1074).
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        const el = document.getElementById(`post-${id}`);
        // Move focus to the card (tabindex=-1 in the template) so keyboard
        // and screen-reader users arriving from a notification get the same
        // "here's your post" cue the highlight gives sighted users (a11y,
        // client canon § Norman feedback). preventScroll lets scrollIntoView
        // own the smooth scroll without a competing instant focus jump.
        el?.focus({ preventScroll: true });
        // The JS behavior option wins over CSS scroll-behavior, so the
        // prefers-reduced-motion guard gates the JS choice here too —
        // the CSS layer is caught globally in styles.scss (#1074).
        el?.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
        });
      });
    });
    // Fade the highlight after it's served its "here it is" purpose.
    // Cancel any in-flight fade first: rapid re-navigation (push toasts
    // within 2.4s — the case the fragment subscription above enables)
    // would otherwise let an older, untracked timer null a newer
    // highlight early, including the A→B→A ordering where the same post
    // is re-lit. Tracking + cancelling the handle leaves only the live
    // highlight's timer pending (#1075 / #1077 reviewer).
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => this.highlightedPostId.set(null), 2400);
  }

  /**
   * Open the event composer dialog. Owner-only — the template hides
   * the trigger when `canPostEvents()` is false, but the method
   * stays guarded so a programmatic open from an athlete context
   * is a no-op rather than a 403 at submit time.
   */
  protected openComposer(): void {
    if (!this.canPostEvents()) return;
    this.composerOpen.set(true);
  }

  /**
   * Composer success callback: prepend the new event to the local
   * feed so it appears at the top without a refresh. The server
   * returns the same `CommunityPostResource` shape the feed reads,
   * so the inserted row is indistinguishable from one fetched via
   * pagination.
   */
  protected onEventCreated(post: CommunityPost): void {
    this.posts.update((existing) => [post, ...existing]);
  }

  @ViewChild(ReactionsListSheetComponent)
  private readonly reactionsSheet?: ReactionsListSheetComponent;

  /** Open the reactions-list sheet for a post. */
  protected openReactionsSheet(post: CommunityPost): void {
    this.reactionsSheetPostId.set(post.id);
    this.reactionsSheetClapCount.set(post.reaction_counts.clap);
    this.reactionsSheetPrayCount.set(post.reaction_counts.pray);
    // Imperative reload — avoids the change-detection race the
    // effect-based shape triggered (Copilot review on #655).
    queueMicrotask(() => this.reactionsSheet?.reload(post.id));
  }

  protected onReactionsSheetVisibleChange(visible: boolean): void {
    if (!visible) {
      this.reactionsSheetPostId.set(null);
    }
  }

  /**
   * Owner-only — opens a confirm dialog, then DELETE /community/posts/{id}.
   * Server soft-deletes the row (preserves auditability); the SPA
   * removes the card from the local feed immediately on success.
   * On error the toast surfaces but the post stays — no optimistic
   * shape since the user already paid for the confirm tap.
   */
  protected confirmDeletePost(post: CommunityPost): void {
    if (!this.canModerate()) return;
    this.confirmationService.confirm({
      header: this.translateService.instant('community.moderation.deletePostTitle'),
      message: this.translateService.instant('community.moderation.deletePostMessage'),
      acceptLabel: this.translateService.instant('community.moderation.deleteAccept'),
      rejectLabel: this.translateService.instant('community.moderation.deleteReject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.deletePost(post.id),
    });
  }

  private deletePost(postId: number): void {
    this.communityService
      .deletePost(postId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.posts.update((existing) => existing.filter((p) => p.id !== postId));
          this.messageService.add({
            severity: 'success',
            summary: this.translateService.instant('community.moderation.postDeletedSummary'),
            life: 3000,
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('community.moderation.postDeleteError'),
            life: 5000,
          });
        },
      });
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

  protected beltOf(post: CommunityPost, field: 'old_belt' | 'new_belt' | 'belt'): Belt | null {
    const raw = post.payload[field];
    return typeof raw === 'string' ? (raw as Belt) : null;
  }

  protected stripesOf(post: CommunityPost, field: 'old_stripes' | 'new_stripes'): number {
    const raw = post.payload[field];
    return typeof raw === 'number' ? raw : 0;
  }

  /**
   * Share a belt-promotion post as an IG-Stories-ready PNG (#959).
   * Renders the card via PromotionShareCardService, then invokes the
   * Web Share API with the file. Falls back to a download when the
   * platform doesn't support file sharing (desktop Chrome / Firefox
   * older builds). Async + best-effort: every error path surfaces a
   * toast and the existing feed render stays untouched.
   */
  protected async onSharePromotion(post: CommunityPost): Promise<void> {
    const newBelt = this.beltOf(post, 'new_belt');
    if (newBelt === null) return;
    const oldBelt = this.beltOf(post, 'old_belt');
    const athleteName = this.athleteNameOf(post) || post.created_by.full_name;

    try {
      // Lazy-load academy for the card footer. AcademyService doesn't
      // cache internally, but a single GET per share tap is cheap.
      const academy = await new Promise<string>((resolve) => {
        this.academyService
          .getMine()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (a) => resolve(a?.name ?? ''),
            error: () => resolve(''),
          });
      });

      const blob = await this.shareCard.toBlob({
        athleteName,
        fromBelt: oldBelt,
        toBelt: newBelt,
        academyName: academy,
        date: post.created_at.slice(0, 10),
      });

      const file = new File([blob], 'budojo-promotion.png', { type: 'image/png' });
      const canShareFile =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

      if (canShareFile && typeof navigator.share === 'function') {
        await navigator.share({
          files: [file],
          title: this.translateService.instant('athletePortal.feed.share.title'),
          text: this.translateService.instant('athletePortal.feed.share.caption', {
            name: athleteName,
          }),
        });
      } else {
        // Fallback: download the PNG. Desktop Chrome doesn't ship file-
        // share to navigator.share, so users on a laptop still get the
        // artifact + can attach it to a Stories upload from their phone
        // via AirDrop / Google Photos.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'budojo-promotion.png';
        a.click();
        URL.revokeObjectURL(url);
        this.messageService.add({
          severity: 'info',
          summary: this.translateService.instant('athletePortal.feed.share.downloadedSummary'),
          life: 3000,
        });
      }
    } catch (err) {
      const aborted =
        err instanceof DOMException &&
        (err.name === 'AbortError' || err.name === 'NotAllowedError');
      if (aborted) return; // user cancelled the share-sheet
      this.messageService.add({
        severity: 'error',
        summary: this.translateService.instant('athletePortal.feed.share.errorSummary'),
        life: 5000,
      });
    }
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
    const previousBreakdown = post.reaction_counts;

    const optimistic = this.predictNextState(post, emoji);
    this.replacePost(post.id, optimistic);

    const stream = this.streamFor(post.id);
    stream.next({
      emoji,
      rollback: () => {
        this.replacePost(post.id, {
          your_reaction: previousReaction,
          reactions_count: previousCount,
          reaction_counts: previousBreakdown,
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
          reaction_counts: {
            clap: response.counts.clap,
            pray: response.counts.pray,
          },
        });
      });

    this.reactionStreams.set(postId, { subject });
    return subject;
  }

  private predictNextState(
    post: CommunityPost,
    emoji: ReactionEmoji,
  ): {
    your_reaction: ReactionEmoji | null;
    reactions_count: number;
    reaction_counts: { clap: number; pray: number };
  } {
    const prev = post.your_reaction;
    const total = post.reactions_count;
    const breakdown = { clap: post.reaction_counts.clap, pray: post.reaction_counts.pray };

    if (prev === null) {
      // Adding a fresh reaction — bump the per-emoji counter + total.
      breakdown[emoji] = breakdown[emoji] + 1;
      return { your_reaction: emoji, reactions_count: total + 1, reaction_counts: breakdown };
    }
    if (prev === emoji) {
      // Same emoji clicked again — toggle off; decrement the per-emoji
      // counter + total (floor 0 in case the server diverged).
      breakdown[emoji] = Math.max(0, breakdown[emoji] - 1);
      return {
        your_reaction: null,
        reactions_count: Math.max(0, total - 1),
        reaction_counts: breakdown,
      };
    }
    // Different emoji — swap in place: decrement the old, increment
    // the new, total unchanged.
    breakdown[prev] = Math.max(0, breakdown[prev] - 1);
    breakdown[emoji] = breakdown[emoji] + 1;
    return { your_reaction: emoji, reactions_count: total, reaction_counts: breakdown };
  }

  private replacePost(
    postId: number,
    patch: Partial<Pick<CommunityPost, 'your_reaction' | 'reactions_count' | 'reaction_counts'>>,
  ): void {
    this.posts.update((list) => list.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
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

  /**
   * Per-post RSVP toggle streams (M9 PR-E2). Same per-post Subject +
   * switchMap shape as reactions so rapid Going → Maybe → Going
   * clicks can't land out of order. Different posts get independent
   * streams.
   */
  private readonly rsvpStreams = new Map<
    number,
    Subject<{ response: RsvpResponse; rollback: () => void }>
  >();

  protected toggleRsvp(post: CommunityPost, response: RsvpResponse): void {
    const previous = {
      your_rsvp: post.your_rsvp,
      rsvps_count: post.rsvps_count,
      going_rsvps_count: post.going_rsvps_count,
      maybe_rsvps_count: post.maybe_rsvps_count,
    };

    const optimistic = this.predictNextRsvp(post, response);
    this.replacePostRsvp(post.id, optimistic);

    const stream = this.rsvpStreamFor(post.id);
    stream.next({
      response,
      rollback: () => {
        this.replacePostRsvp(post.id, previous);
      },
    });
  }

  private rsvpStreamFor(postId: number): Subject<{ response: RsvpResponse; rollback: () => void }> {
    const existing = this.rsvpStreams.get(postId);
    if (existing) return existing;

    const subject = new Subject<{ response: RsvpResponse; rollback: () => void }>();
    subject
      .pipe(
        switchMap(({ response, rollback }) =>
          this.communityService.toggleRsvp(postId, response).pipe(
            catchError(() => {
              rollback();
              this.messageService.add({
                severity: 'error',
                summary: this.translateService.instant('athletePortal.feed.rsvpToastError'),
                life: 3000,
              });
              return of<RsvpToggleResponse | null>(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((resp) => {
        if (resp === null) return;
        this.replacePostRsvp(postId, {
          your_rsvp: resp.your_rsvp,
          rsvps_count: resp.counts.going + resp.counts.maybe,
          going_rsvps_count: resp.counts.going,
          maybe_rsvps_count: resp.counts.maybe,
        });
      });

    this.rsvpStreams.set(postId, subject);
    return subject;
  }

  // other-vote→switch keeps the total flat but shifts counts between buckets — the case a single rsvps_count couldn't model.
  private predictNextRsvp(
    post: CommunityPost,
    response: RsvpResponse,
  ): {
    your_rsvp: RsvpResponse | null;
    rsvps_count: number;
    going_rsvps_count: number;
    maybe_rsvps_count: number;
  } {
    const bumpGoing = (n: number) => (response === 'going' ? n + 1 : n);
    const bumpMaybe = (n: number) => (response === 'maybe' ? n + 1 : n);
    const dropGoing = (n: number) => (response === 'going' ? Math.max(0, n - 1) : n);
    const dropMaybe = (n: number) => (response === 'maybe' ? Math.max(0, n - 1) : n);

    if (post.your_rsvp === null) {
      return {
        your_rsvp: response,
        rsvps_count: post.rsvps_count + 1,
        going_rsvps_count: bumpGoing(post.going_rsvps_count),
        maybe_rsvps_count: bumpMaybe(post.maybe_rsvps_count),
      };
    }
    if (post.your_rsvp === response) {
      return {
        your_rsvp: null,
        rsvps_count: Math.max(0, post.rsvps_count - 1),
        going_rsvps_count: dropGoing(post.going_rsvps_count),
        maybe_rsvps_count: dropMaybe(post.maybe_rsvps_count),
      };
    }
    // Switch — total unchanged, one bucket +1 and the other -1.
    const switchedGoing =
      response === 'going' ? post.going_rsvps_count + 1 : Math.max(0, post.going_rsvps_count - 1);
    const switchedMaybe =
      response === 'maybe' ? post.maybe_rsvps_count + 1 : Math.max(0, post.maybe_rsvps_count - 1);
    return {
      your_rsvp: response,
      rsvps_count: post.rsvps_count,
      going_rsvps_count: switchedGoing,
      maybe_rsvps_count: switchedMaybe,
    };
  }

  private replacePostRsvp(
    postId: number,
    patch: {
      your_rsvp: RsvpResponse | null;
      rsvps_count: number;
      going_rsvps_count: number;
      maybe_rsvps_count: number;
    },
  ): void {
    this.posts.update((list) =>
      list.map((p) =>
        p.id === postId
          ? {
              ...p,
              your_rsvp: patch.your_rsvp,
              rsvps_count: patch.rsvps_count,
              going_rsvps_count: patch.going_rsvps_count,
              maybe_rsvps_count: patch.maybe_rsvps_count,
            }
          : p,
      ),
    );
  }
}
