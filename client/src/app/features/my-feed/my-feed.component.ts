import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
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

  protected readonly posts = signal<readonly CommunityPost[]>([]);
  protected readonly loading = signal(true);
  protected readonly currentPage = signal(1);
  protected readonly lastPage = signal(1);
  protected readonly loadError = signal(false);

  ngOnInit(): void {
    this.load(1);
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.communityService.getFeed(page).subscribe({
      next: (response: CommunityFeedPage) => {
        this.posts.set(response.data);
        this.currentPage.set(response.meta.current_page);
        this.lastPage.set(response.meta.last_page);
        this.loading.set(false);
      },
      error: () => {
        this.posts.set([]);
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
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
