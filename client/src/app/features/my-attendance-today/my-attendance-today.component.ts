import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import {
  AttendanceService,
  MarkTodayResult,
  TodayPeer,
  UnmarkTodayResult,
} from '../../core/services/attendance.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { BeltBadgeComponent } from '../../shared/components/belt-badge/belt-badge.component';
import type { Belt } from '../../core/services/athlete.service';

/**
 * Self-mark today's presence (#960). Athlete-portal page reached from
 * the 07:00 "today is training day" push or via the sidebar.
 *
 * Three template branches:
 *   - `not-training-day` — academy schedule says today is off.
 *   - `marked` — a row exists for the athlete on today. Shows the
 *     Annulla button ONLY when the row is athlete-self-marked
 *     (instructor marks are locked to the instructor).
 *   - `unmarked` — the athlete can tap "I'm here today".
 *
 * The page calls POST on first render IF the user came in fresh and
 * we don't yet know the state — but rather than a separate "GET state"
 * endpoint, we deliberately let the POST itself bring the state back
 * (idempotent — returns the existing row on second call). Saves an
 * endpoint and a round-trip on the typical "I just landed and want
 * to confirm" flow.
 *
 * No: we cannot let the page auto-POST on mount — that would silently
 * mark every athlete who clicks the push WITHOUT confirming intent.
 * The button is the gate; the page boots in an "unknown" state and
 * the user explicitly taps to mark. State is checked once on the
 * RESPONSE shape (201 = was unmarked + just marked, 200 = was
 * already marked → either branch shows the "marked" state).
 */
type Status = 'not-training-day' | 'marked' | 'unmarked';

@Component({
  selector: 'app-my-attendance-today',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    ButtonModule,
    PageHeaderComponent,
    UserAvatarComponent,
    BeltBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-attendance-today.component.html',
  styleUrl: './my-attendance-today.component.scss',
})
export class MyAttendanceTodayComponent {
  private readonly attendanceService = inject(AttendanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  /** UI status of the page — drives the template @switch. */
  protected readonly status = signal<Status>('unmarked');
  /** True while a mark/unmark POST/DELETE is in flight. */
  protected readonly busy = signal<boolean>(false);
  /** Source of the existing row when status === 'marked'. Drives whether
   *  Annulla is shown (only own self-marks can be reverted). */
  protected readonly source = signal<'self' | 'instructor' | null>(null);

  /** Peers already marked for today (#958). Auto-loaded on mount;
   *  refreshed after mark/unmark so the current user appears / vanishes
   *  in the preview row. `null` = caller is an owner-only user (no
   *  athlete row) — page bounces, so this branch is effectively dead. */
  protected readonly peers = signal<readonly TodayPeer[]>([]);
  protected readonly peersOverflow = signal<number>(0);

  protected readonly canUnmark = computed(
    () => this.status() === 'marked' && this.source() === 'self',
  );

  /** Today's date, formatted with the active locale's full date — the
   *  big "Tonight, Friday 22 May" headline on the page. */
  protected readonly todayLabel = computed(() => {
    return new Date().toLocaleDateString(this.translate.currentLang() || 'en', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  });

  constructor() {
    // Auto-load peers on mount — the preview row is THE selling point
    // of the page ("ah viene Marco, ci sono"), so we don't gate it
    // behind the user's first tap.
    this.refreshPeers();
  }

  /** Reload the peer set. Called on mount + after every mark/unmark
   *  so the current user appears / vanishes in the preview. */
  private refreshPeers(): void {
    this.attendanceService
      .getTodayPeers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          if (rows === null) return;
          this.peers.set(rows.slice(0, 8));
          this.peersOverflow.set(Math.max(0, rows.length - 8));
        },
        error: () => {
          // Silent — the preview is a quality-of-life feature, not
          // load-bearing. The mark button still works.
          this.peers.set([]);
          this.peersOverflow.set(0);
        },
      });
  }

  protected beltOf(belt: string): Belt {
    return belt as Belt;
  }

  protected onMark(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.attendanceService
      .markToday()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result: MarkTodayResult) => {
          this.busy.set(false);
          if (result.status === 'marked') {
            this.status.set('marked');
            this.source.set(result.record.source);
            this.refreshPeers();
            this.messageService.add({
              severity: 'success',
              summary: this.translate.instant('myAttendanceToday.markedToast.summary'),
              life: 3000,
            });
          } else if (result.status === 'not-training-day') {
            this.status.set('not-training-day');
          } else if (result.status === 'no-athlete') {
            // No athlete row — the user shouldn't be on the athlete
            // shell at all; bounce to the owner dashboard.
            void this.router.navigateByUrl('/dashboard');
          }
        },
        error: () => {
          this.busy.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('myAttendanceToday.markErrorToast.summary'),
            detail: this.translate.instant('myAttendanceToday.markErrorToast.detail'),
            life: 5000,
          });
        },
      });
  }

  protected onUnmark(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.attendanceService
      .unmarkToday()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result: UnmarkTodayResult) => {
          this.busy.set(false);
          if (result.status === 'unmarked') {
            this.status.set('unmarked');
            this.source.set(null);
            this.refreshPeers();
            this.messageService.add({
              severity: 'info',
              summary: this.translate.instant('myAttendanceToday.unmarkedToast.summary'),
              life: 3000,
            });
          } else if (result.status === 'instructor-locked') {
            // Race: the instructor marked between mount and tap. Flip
            // the status to 'marked' (instructor) so Annulla disappears
            // and the user sees the truthful state.
            this.status.set('marked');
            this.source.set('instructor');
            this.messageService.add({
              severity: 'warn',
              summary: this.translate.instant('myAttendanceToday.instructorLockedToast.summary'),
              detail: this.translate.instant('myAttendanceToday.instructorLockedToast.detail'),
              life: 5000,
            });
          } else if (result.status === 'no-athlete') {
            // Athlete row was removed between mount and tap (rare —
            // owner deleted the roster row during the session). Mirror
            // the onMark() bounce so the user isn't stuck on a page
            // that can never resolve.
            void this.router.navigateByUrl('/dashboard');
          }
        },
        error: () => {
          this.busy.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('myAttendanceToday.unmarkErrorToast.summary'),
            life: 5000,
          });
        },
      });
  }
}
