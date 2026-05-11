import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { TextareaModule } from 'primeng/textarea';
import { CommunityService, PostComment } from '../../../core/services/community.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserFlairComponent } from '../../../shared/components/user-flair/user-flair.component';

/**
 * Comments thread mounted under each feed card (#604, M9 PR-D2
 * client). Lazy-loads the thread on first open so the feed paint
 * stays cheap when no card is expanded — the count-only collapsed
 * shape is rendered by the parent card.
 *
 * Three interactions today:
 *
 * - List (paginated 50/page; V1 only shows page 1 — Load-more
 *   button appears when meta.last_page > 1).
 * - Create (textarea + send; 500-char cap mirrors the server).
 * - Delete-own (a comment by the current user gets an inline
 *   trash icon; clicking optimistically removes it + fires the
 *   API; rollback on error).
 */
@Component({
  selector: 'app-comments-thread',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe, ButtonModule, TextareaModule, UserFlairComponent],
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

  protected readonly comments = signal<readonly PostComment[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly currentPage = signal(1);
  protected readonly submitting = signal(false);

  protected readonly draft = signal('');
  protected readonly currentUserId = signal<number | null>(null);

  protected readonly MAX_BODY = 500;

  ngOnInit(): void {
    const user = this.authService.user();
    this.currentUserId.set(user?.id ?? null);
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
   * the API. On error, restore and toast. Server is the source of
   * truth on the next page refresh.
   */
  protected deleteComment(comment: PostComment): void {
    const snapshot = this.comments();
    this.comments.update((list) => list.filter((c) => c.id !== comment.id));

    this.communityService
      .deleteComment(comment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.comments.set(snapshot);
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
    return me !== null && me === comment.created_by.id;
  }
}
