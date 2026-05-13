import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import {
  CommunityService,
  type PostReactionItem,
  type ReactionEmoji,
} from '../../../core/services/community.service';
import { UserFlairComponent } from '../../../shared/components/user-flair/user-flair.component';

/**
 * Bottom-sheet (mobile) / dialog (desktop) listing every reaction on
 * a community post — Facebook-style "who reacted with what" (post-
 * v2.9.0). Opens on tap of the reaction counter next to 👏 / 🙏 in
 * the feed card.
 *
 * V1 surfaces tabs for "All / 👏 Clap / 🙏 Pray" with counts. The
 * server returns reactions ordered by recency; client-side filter
 * decides which to render based on the active tab. Pagination
 * appends — "Load more" pulls the next page in place. Small
 * page size (20) means most posts fit in one fetch.
 */
type ReactionTab = 'all' | ReactionEmoji;

@Component({
  selector: 'app-reactions-list-sheet',
  standalone: true,
  imports: [TranslatePipe, DialogModule, ButtonModule, SkeletonModule, UserFlairComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reactions-list-sheet.component.html',
  styleUrl: './reactions-list-sheet.component.scss',
})
export class ReactionsListSheetComponent {
  private readonly communityService = inject(CommunityService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = input<boolean>(false);
  readonly visibleChange = output<boolean>();
  readonly postId = input<number | null>(null);
  /** Per-emoji counts from the parent post — drives the tab badges without an extra fetch. */
  readonly clapCount = input<number>(0);
  readonly prayCount = input<number>(0);

  protected readonly reactions = signal<readonly PostReactionItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly currentPage = signal(1);
  protected readonly lastPage = signal(1);
  protected readonly activeTab = signal<ReactionTab>('all');

  protected readonly filteredReactions = computed(() => {
    const tab = this.activeTab();
    if (tab === 'all') return this.reactions();
    return this.reactions().filter((r) => r.emoji === tab);
  });

  protected readonly hasMore = computed(() => this.currentPage() < this.lastPage());

  constructor() {
    // Re-fetch every time the sheet opens for a new post. `effect`
    // tracks both `visible` and `postId`; closing-then-reopening
    // refreshes too so a third user's reaction added in between
    // shows up.
    effect(() => {
      const isOpen = this.visible();
      const id = this.postId();
      if (isOpen && id !== null) {
        this.load(id, 1, true);
      }
    });
  }

  protected onClose(): void {
    this.visibleChange.emit(false);
  }

  protected setTab(tab: ReactionTab): void {
    this.activeTab.set(tab);
  }

  protected loadMore(): void {
    const id = this.postId();
    if (id === null || !this.hasMore() || this.loading()) return;
    this.load(id, this.currentPage() + 1, false);
  }

  private load(postId: number, page: number, replace: boolean): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.communityService
      .listReactions(postId, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.reactions.update((list) => (replace ? resp.data : [...list, ...resp.data]));
          this.currentPage.set(resp.meta.current_page);
          this.lastPage.set(resp.meta.last_page);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }
}
