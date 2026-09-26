import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  ElementRef,
  Injector,
  afterNextRender,
  runInInjectionContext,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Tooltip } from 'primeng/tooltip';
import { NgTemplateOutlet } from '@angular/common';
import { finalize } from 'rxjs';
import { SkeletonModule } from 'primeng/skeleton';
import {
  InboxNotification,
  NotificationInboxService,
} from '../../core/services/notification-inbox.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { groupNotifications } from './notification-grouping';
import { notificationVisual } from './notification-visual';

/** How long "Annulla" stays after an archive (#1914). */
const UNDO_MS = 8000;

/**
 * Social-native notifications page (#1129, epic #1128). Full-screen,
 * shared by both shells (owner `/dashboard/notifications` + athlete
 * `/dashboard/me/notifications`), reached from the topbar bell.
 *
 * Reads the inbox signal already maintained by NotificationInboxService;
 * a `Nuove` section surfaces the unread rows, the read ones bucket into
 * Oggi / Questa settimana / Prima. Rich rows carry the actor avatar (or a
 * type-icon tile for system notifications) + a category badge driven by
 * the stable `kind`. Tapping a row marks it read and follows its deep link.
 */
@Component({
  selector: 'app-notifications-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    SkeletonModule,
    Tooltip,
    NgTemplateOutlet,
    UserAvatarComponent,
    RelativeTimePipe,
    PageHeaderComponent,
    ErrorStateComponent,
  ],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss',
})
export class NotificationsPageComponent implements OnInit {
  private readonly inbox = inject(NotificationInboxService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /**
   * Two views of one inbox (#1914): what still needs the owner, and what they
   * archived. They replace "Tutte / Non lette", which answered "have I seen
   * it?" — unread rows already lead the inbox as "Nuove" — and never "have I
   * dealt with it?".
   */
  protected readonly view = signal<'inbox' | 'archived'>('inbox');
  protected readonly archived = signal<readonly InboxNotification[] | null>(null);

  protected readonly unread = this.inbox.unread;
  protected readonly groups = computed(() => groupNotifications(this.inbox.rows()));
  protected readonly isEmpty = computed(() =>
    this.view() === 'inbox' ? this.groups().length === 0 : (this.archived()?.length ?? 0) === 0,
  );
  /** "Archivia le lette" has something to do. */
  protected readonly hasRead = computed(() => this.inbox.rows().some((n) => n.read_at !== null));

  /**
   * What was just archived, offered back for a few seconds (#1914). Undo, not
   * a confirmation: archiving loses nothing, so asking first would only slow
   * down the one thing the owner does here most.
   */
  protected readonly justArchived = signal<readonly string[] | null>(null);
  protected readonly undoFailed = signal(false);
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly undoButton = viewChild<ElementRef<HTMLButtonElement>>('undoButton');
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Template helper — `kind` → { icon, tone } for the badge / tile. */
  protected readonly visualFor = notificationVisual;

  ngOnInit(): void {
    this.load();
    this.destroyRef.onDestroy(() => this.clearUndo());
  }

  /**
   * Extracted so the error state can offer a retry (#1499).
   *
   * The error branch used to be a bare paragraph reading "Couldn't load your
   * notifications. Try again." — naming an action the page did not offer. The
   * only way back was a page reload the reader had to think of themselves.
   */
  protected load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.inbox
      .load()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({ error: () => this.loadError.set(true) });
  }

  protected setView(view: 'inbox' | 'archived'): void {
    this.view.set(view);
    this.undoFailed.set(false);
    if (view === 'archived') {
      this.loadArchived();
    }
  }

  private loadArchived(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.inbox
      .listArchived()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (rows) => this.archived.set(rows),
        error: () => this.loadError.set(true),
      });
  }

  /** The retry the error state offers, for whichever view failed. */
  protected reload(): void {
    if (this.view() === 'archived') {
      this.loadArchived();
    } else {
      this.load();
    }
  }

  protected archive(notification: InboxNotification): void {
    this.inbox
      .archive(notification.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.offerUndo([notification.id]));
  }

  protected archiveRead(): void {
    this.inbox
      .archiveRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ids) => this.offerUndo(ids));
  }

  /** "Ripristina" on an archived row: back into the inbox, in its place. */
  protected unarchive(notification: InboxNotification): void {
    this.inbox
      .unarchive(notification.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.archived.update((rows) => rows?.filter((n) => n.id !== notification.id) ?? null);
        this.inbox.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
      });
  }

  /** "Annulla": everything just archived goes back, and the inbox is read again. */
  protected undo(): void {
    const ids = this.justArchived();
    this.clearUndo();
    if (ids === null || ids.length === 0) return;

    // "Annulla" takes itself away as it is pressed: focus goes to the first
    // row it brought back, or to the tab if it could not.
    this.inbox
      .unarchiveMany(ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this.inbox
            .load()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.focusAfterRender(`[data-cy="notification-${ids[0]}"]`)),
        // Said where the undo was, rather than failing without a word: the
        // rows are still under "Archiviate".
        error: () => {
          this.undoFailed.set(true);
          this.focusAfterRender('[data-cy="notifications-filter-inbox"]');
        },
      });
  }

  private offerUndo(ids: readonly string[]): void {
    if (ids.length === 0) return;
    this.clearUndo();
    this.undoFailed.set(false);
    this.justArchived.set(ids);
    this.startUndoTimer();
    // The row that held focus is gone: focus goes to "Annulla", the one
    // thing that can follow, instead of falling to the page.
    runInInjectionContext(this.injector, () =>
      afterNextRender(() => this.undoButton()?.nativeElement.focus()),
    );
  }

  /**
   * The undo closes on its own only while nobody is in it (#1914): a bar
   * that vanishes under the focus drops a keyboard user onto the page, and
   * cuts short the time to read it. Paused on focus in, restarted on out.
   */
  protected holdUndo(): void {
    if (this.undoTimer !== null) clearTimeout(this.undoTimer);
    this.undoTimer = null;
  }

  protected releaseUndo(event: FocusEvent): void {
    const region = event.currentTarget as HTMLElement | null;
    if (region?.contains(event.relatedTarget as Node | null)) return;
    if (this.justArchived() !== null) this.startUndoTimer();
  }

  private focusAfterRender(selector: string): void {
    runInInjectionContext(this.injector, () =>
      afterNextRender(() =>
        (this.host.nativeElement.querySelector(selector) as HTMLElement | null)?.focus(),
      ),
    );
  }

  private startUndoTimer(): void {
    this.holdUndo();
    this.undoTimer = setTimeout(() => this.justArchived.set(null), UNDO_MS);
  }

  private clearUndo(): void {
    if (this.undoTimer !== null) clearTimeout(this.undoTimer);
    this.undoTimer = null;
    this.justArchived.set(null);
  }

  protected open(notification: InboxNotification): void {
    if (notification.read_at === null) {
      this.inbox.markAsRead(notification.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }
    if (notification.link) {
      void this.router.navigateByUrl(notification.link);
    }
  }

  protected markAllAsRead(): void {
    this.inbox.markAllAsRead().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
