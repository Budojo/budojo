import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ActiveSession, SessionService } from '../../../core/services/session.service';
import { ConfirmDestructiveButtonComponent } from '../../../shared/components/confirm-destructive-button/confirm-destructive-button.component';

/**
 * "Active sessions" panel on `/dashboard/profile` (#413).
 *
 * Lists every Sanctum session tied to the current user with a
 * device label, a last-used timestamp, and a per-row revoke action.
 * Stamps a "this session" pill on the row that authenticated the
 * page. Header CTA "Revoke all others" wipes every session except
 * the current one — the standard "I lost my laptop" remediation.
 *
 * Renders inside the profile page's card chrome. No standalone
 * route; the component is composed into the profile template.
 */
@Component({
  selector: 'app-profile-sessions',
  standalone: true,
  imports: [
    ButtonModule,
    ConfirmDestructiveButtonComponent,
    ConfirmPopupModule,
    DatePipe,
    ProgressSpinnerModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-sessions.component.html',
  styleUrl: './profile-sessions.component.scss',
  providers: [ConfirmationService],
})
export class ProfileSessionsComponent implements OnInit {
  private readonly sessionService = inject(SessionService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal<boolean>(true);
  protected readonly sessions = signal<readonly ActiveSession[]>([]);
  protected readonly revokingId = signal<number | null>(null);
  protected readonly revokingOthers = signal<boolean>(false);
  protected readonly errored = signal<boolean>(false);

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.sessionService.list().subscribe({
      next: (rows) => {
        this.sessions.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }

  /**
   * Confirmed-handler for the per-row revoke. The confirm step now lives
   * in `app-confirm-destructive-button` (#1103); this runs on accept.
   */
  protected revoke(session: ActiveSession): void {
    this.revokingId.set(session.id);
    this.sessionService.revoke(session.id).subscribe({
      next: () => {
        // Clear the per-row spinner BEFORE the early-return path so a
        // current-session revoke doesn't leave the row stuck in a
        // permanent loading state if the auth interceptor takes a
        // beat to bounce. Symmetric with the other branches.
        this.revokingId.set(null);

        // The CURRENT session was just revoked — the next request
        // bounces on 401 and the auth interceptor handles the
        // sign-out. Don't refresh the list (the call would also
        // bounce). Stay put; the auth-interceptor takes over.
        if (session.is_current) {
          return;
        }
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.sessions.revokeToast.summary'),
          detail: this.translate.instant('profile.sessions.revokeToast.detail', {
            device: session.name,
          }),
          life: 4000,
        });
        this.refresh();
      },
      error: () => {
        this.revokingId.set(null);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.sessions.revokeError.summary'),
          detail: this.translate.instant('profile.sessions.revokeError.detail'),
          life: 5000,
        });
      },
    });
  }

  /** Confirmed-handler for "revoke all others" — the confirm lives in the shell (#1103). */
  protected revokeOthers(): void {
    this.revokingOthers.set(true);
    this.sessionService.revokeOthers().subscribe({
      next: (count) => {
        this.revokingOthers.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.sessions.revokeOthersToast.summary'),
          detail:
            count === 0
              ? this.translate.instant('profile.sessions.revokeOthersToast.detailNone')
              : this.translate.instant('profile.sessions.revokeOthersToast.detail', {
                  count,
                }),
          life: 4000,
        });
        this.refresh();
      },
      error: () => {
        this.revokingOthers.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.sessions.revokeError.summary'),
          detail: this.translate.instant('profile.sessions.revokeError.detail'),
          life: 5000,
        });
      },
    });
  }

  protected hasOtherSessions(): boolean {
    return this.sessions().some((s) => !s.is_current);
  }
}
