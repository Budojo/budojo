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
import {
  CommunityFeedPage,
  CommunityPost,
  CommunityService,
} from '../../core/services/community.service';
import type { Belt } from '../../core/services/athlete.service';
import { BeltBadgeComponent } from '../../shared/components/belt-badge/belt-badge.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';

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
  imports: [TranslatePipe, DatePipe, SkeletonModule, BeltBadgeComponent, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-feed.component.html',
  styleUrl: './my-feed.component.scss',
})
export class MyFeedComponent implements OnInit {
  private readonly communityService = inject(CommunityService);
  private readonly destroyRef = inject(DestroyRef);

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
}
