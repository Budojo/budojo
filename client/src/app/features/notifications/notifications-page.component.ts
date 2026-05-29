import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { SkeletonModule } from 'primeng/skeleton';
import {
  InboxNotification,
  NotificationInboxService,
} from '../../core/services/notification-inbox.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { groupNotifications } from './notification-grouping';
import { notificationVisual } from './notification-visual';

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
    UserAvatarComponent,
    RelativeTimePipe,
    PageHeaderComponent,
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
  protected readonly unreadOnly = signal(false);

  protected readonly unread = this.inbox.unread;
  protected readonly groups = computed(() =>
    groupNotifications(this.inbox.rows(), this.unreadOnly()),
  );
  protected readonly isEmpty = computed(() => this.groups().length === 0);

  /** Template helper — `kind` → { icon, tone } for the badge / tile. */
  protected readonly visualFor = notificationVisual;

  ngOnInit(): void {
    this.inbox
      .load()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({ error: () => this.loadError.set(true) });
  }

  protected setUnreadOnly(unreadOnly: boolean): void {
    this.unreadOnly.set(unreadOnly);
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
