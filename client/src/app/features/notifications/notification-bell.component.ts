import { ChangeDetectionStrategy, Component, HostListener, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';

/**
 * Topbar notification bell (#418, #1129). Shows the unread badge and,
 * on tap, navigates to the full-screen notifications page — the social
 * refactor replaced the popover dropdown with a dedicated page, so the
 * bell is now a pure entry point + unread indicator. The count hydrates
 * on init and refreshes when the tab regains focus, so the badge stays
 * truthful without polling.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [TooltipModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent implements OnInit {
  private readonly inboxService = inject(NotificationInboxService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly unread = this.inboxService.unread;
  protected readonly hasUnread = this.inboxService.hasUnread;

  ngOnInit(): void {
    this.refresh();
  }

  /** Tap the bell → the full-screen notifications page for the active shell. */
  protected open(): void {
    const target =
      this.auth.user()?.role === 'athlete'
        ? '/dashboard/me/notifications'
        : '/dashboard/notifications';
    void this.router.navigateByUrl(target);
  }

  private refresh(): void {
    this.inboxService.load().subscribe({ error: () => undefined });
  }

  /**
   * Refresh the unread count when the user switches BACK to this tab —
   * `document:visibilitychange` firing with `visibilityState ===
   * 'visible'` is the standard "tab active again" signal. Covers a
   * notification produced server-side while the tab was inactive; one
   * indexed query, no background polling.
   */
  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.refresh();
    }
  }
}
