import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { Popover, PopoverModule } from 'primeng/popover';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TranslatePipe } from '@ngx-translate/core';
import {
  InboxNotification,
  NotificationInboxService,
} from '../../core/services/notification-inbox.service';

/**
 * Bell-icon notification center (#418). Sits in the dashboard topbar
 * next to the user-avatar chip. Shows a badge with the unread count;
 * tapping the bell opens a PrimeNG `p-overlayPanel` listing the
 * latest 20 rows. Each row is clickable — clicking navigates to the
 * row's `link` (when present) AND flips the row to read in the same
 * call. A "Mark all as read" CTA at the top bulk-flips.
 *
 * Data hydrates lazily — the first time the bell renders we fire one
 * GET to `/me/notifications`. The dashboard shell mounts the bell
 * once, so this fetch happens at-most-once per page load.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [
    ButtonModule,
    DatePipe,
    PopoverModule,
    ProgressSpinnerModule,
    TooltipModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent implements OnInit {
  private readonly inboxService = inject(NotificationInboxService);
  private readonly router = inject(Router);

  @ViewChild('panel') panel!: Popover;

  protected readonly rows = this.inboxService.rows;
  protected readonly unread = this.inboxService.unread;
  protected readonly hasUnread = this.inboxService.hasUnread;
  protected readonly loading = signal<boolean>(false);

  ngOnInit(): void {
    this.refresh();
  }

  protected toggle(event: Event): void {
    this.panel.toggle(event);
  }

  protected refresh(): void {
    this.loading.set(true);
    this.inboxService.load().subscribe({
      next: () => this.loading.set(false),
      error: () => this.loading.set(false),
    });
  }

  protected openRow(row: InboxNotification): void {
    if (row.read_at === null) {
      this.inboxService.markAsRead(row.id).subscribe();
    }
    if (row.link !== null) {
      this.router.navigate([row.link]);
    }
    this.panel.hide();
  }

  protected markAllRead(): void {
    this.inboxService.markAllAsRead().subscribe();
  }

  /**
   * Refresh the list when the panel re-opens — covers the case where
   * a notification was sent server-side between visits. Cheap (one
   * indexed query) and avoids stale data without polling.
   */
  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.refresh();
    }
  }
}
