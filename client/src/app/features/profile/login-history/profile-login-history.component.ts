import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TranslatePipe } from '@ngx-translate/core';
import { LoginAttempt, LoginHistoryService } from '../../../core/services/login-history.service';

/**
 * "Login history" panel on `/dashboard/profile` (#430).
 *
 * Read-only list of the most recent 50 login attempts (success +
 * failure) for the authenticated user. Pairs with the active-sessions
 * panel: sessions covers LIVE tokens, history covers PAST attempts —
 * including ones whose token has since been revoked or expired.
 *
 * Each row carries: success/failure stamp, friendly device label
 * parsed server-side from the User-Agent, IP (or "—" placeholder
 * when none was captured), and the attempt timestamp. A footer hint
 * links to the password-change form for the "if something looks
 * unfamiliar, change your password" flow.
 */
@Component({
  selector: 'app-profile-login-history',
  standalone: true,
  imports: [ButtonModule, DatePipe, ProgressSpinnerModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-login-history.component.html',
  styleUrl: './profile-login-history.component.scss',
})
export class ProfileLoginHistoryComponent implements OnInit {
  private readonly loginHistoryService = inject(LoginHistoryService);

  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly rows = signal<readonly LoginAttempt[]>([]);

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.loginHistoryService.list().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }
}
