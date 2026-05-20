import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { TextareaModule } from 'primeng/textarea';
import { CommunityService, PostComment } from '../../../core/services/community.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserFlairComponent } from '../../../shared/components/user-flair/user-flair.component';
import { MentionTextComponent } from '../../../shared/components/mention-text/mention-text.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';

/**
 * Comments thread mounted under each feed card (#604, M9 PR-D2
 * client). Lazy-loads the thread on first open so the feed paint
 * stays cheap when no card is expanded — the count-only collapsed
 * shape is rendered by the parent card.
 *
 * Three interactions today:
 *
 * - List (paginated 50/page; a "Load more" button appends the next
 *   page in place — subsequent pages add to the existing list
 *   rather than replacing it, the natural thread-grows-over-time UX).
 * - Create (textarea + send; 500-char cap mirrors the server). On
 *   success, emits `commentCountDelta = +1` so the parent feed
 *   card's counter pill stays accurate without re-fetching the feed.
 * - Delete-own (a comment by the current user gets an inline trash
 *   icon; clicking optimistically removes it + fires the API;
 *   surgical rollback on error — re-inserts just the deleted row
 *   at its previous index so concurrent inserts/deletes from other
 *   in-flight calls aren't clobbered). On success, emits
 *   `commentCountDelta = -1`.
 */
@Component({
  selector: 'app-comments-thread',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ButtonModule,
    TextareaModule,
    UserFlairComponent,
    MentionTextComponent,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comments-thread.component.html',
  styleUrl: './comments-thread.component.scss',
})
export class CommentsThreadComponent implements OnInit {
  private readonly communityService = inject(CommunityService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  readonly postId = input.required<number>();

  /**
   * Net change to the parent post's `comments_count` since the
   * thread opened — +1 per successful create, -1 per successful
   * delete. Emitted as a delta (not absolute) so the parent can
   * apply it to the most recent value without coupling.
   */
  readonly commentCountDelta = output<number>();

  protected readonly comments = signal<readonly PostComment[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly currentPage = signal(1);
  protected readonly submitting = signal(false);

  protected readonly draft = signal('');
  protected readonly currentUserId = signal<number | null>(null);
  /**
   * Owner-moderation flag (#641, follow-up to the M9 community
   * surface). When true, every comment carries a delete affordance —
   * not just the user's own. The DeleteCommentRequest authorize gate
   * has supported the owner-deletes-any path since M9 PR-D server,
   * the SPA just hadn't surfaced it.
   */
  protected readonly isOwner = signal(false);

  protected readonly MAX_BODY = 500;

  ngOnInit(): void {
    const user = this.authService.user();
    this.currentUserId.set(user?.id ?? null);
    this.isOwner.set(user?.role === 'owner');
    this.loadPage(1);
  }

  protected loadPage(page: number): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.communityService
      .listComments(this.postId(), page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          if (page === 1) {
            this.comments.set(resp.data);
          } else {
            this.comments.update((list) => [...list, ...resp.data]);
          }
          this.currentPage.set(resp.meta.current_page);
          this.hasMore.set(resp.meta.current_page < resp.meta.last_page);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set(true);
        },
      });
  }

  protected loadMore(): void {
    this.loadPage(this.currentPage() + 1);
  }

  protected canSubmit(): boolean {
    const t = this.draft().trim();
    return t.length > 0 && t.length <= this.MAX_BODY && !this.submitting();
  }

  protected submitComment(): void {
    if (!this.canSubmit()) return;
    const body = this.draft().trim();
    this.submitting.set(true);

    this.communityService
      .createComment(this.postId(), body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.comments.update((list) => [...list, created]);
          this.draft.set('');
          this.submitting.set(false);
          this.commentCountDelta.emit(1);
        },
        error: () => {
          this.submitting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('athletePortal.feed.commentSubmitError'),
            life: 3000,
          });
        },
      });
  }

  /**
   * Optimistic delete — pull the comment from the local list, fire
   * the API. On success, emit the count-delta. On error, re-insert
   * the removed comment at its previous index so concurrent
   * inserts (a successful new post in flight, another delete) are
   * preserved — clobbering the whole snapshot would erase those.
   */
  protected deleteComment(comment: PostComment): void {
    const before = this.comments();
    const previousIndex = before.findIndex((c) => c.id === comment.id);
    if (previousIndex === -1) return;

    this.comments.update((list) => list.filter((c) => c.id !== comment.id));

    this.communityService
      .deleteComment(comment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.commentCountDelta.emit(-1),
        error: () => {
          this.comments.update((list) => {
            // Re-insertion is a no-op if a concurrent path already
            // happens to contain the comment (defensive).
            if (list.some((c) => c.id === comment.id)) return list;
            const next = [...list];
            const clampedIndex = Math.min(previousIndex, next.length);
            next.splice(clampedIndex, 0, comment);
            return next;
          });
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('athletePortal.feed.commentDeleteError'),
            life: 3000,
          });
        },
      });
  }

  protected canDelete(comment: PostComment): boolean {
    const me = this.currentUserId();
    if (me === null) return false;
    // Author always wins; owners get the moderation hook even when
    // they aren't the author. Server-side DeleteCommentRequest
    // matches the same two paths (#604) so this gate stays honest.
    return me === comment.created_by.id || this.isOwner();
  }
}
