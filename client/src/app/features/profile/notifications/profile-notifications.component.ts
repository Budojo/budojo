import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  NotificationPreferences,
  NotificationPreferencesService,
} from '../../../core/services/notification-preferences.service';

/**
 * Per-category email-notification opt-out panel on
 * `/dashboard/profile` (#416). One switch per toggleable category,
 * plus a read-only "always sent" block for the transactional
 * categories that are never opt-out (welcome, password-reset,
 * email-verification, account-deletion-*).
 *
 * Optimistic local update on toggle: flip the switch, fire the PATCH
 * in the background, refresh on response. On failure, revert the
 * switch and toast.
 */

interface ToggleableCategory {
  readonly key: string;
  readonly i18nLabel: string;
  readonly i18nDescription: string;
}

const CATEGORIES: readonly ToggleableCategory[] = [
  {
    key: 'medical_cert_expiry_reminders',
    i18nLabel: 'profile.notifications.medicalCertReminders.label',
    i18nDescription: 'profile.notifications.medicalCertReminders.description',
  },
  {
    key: 'unpaid_athletes_digest',
    i18nLabel: 'profile.notifications.unpaidAthletesDigest.label',
    i18nDescription: 'profile.notifications.unpaidAthletesDigest.description',
  },
  {
    key: 'athlete_signed_up',
    i18nLabel: 'profile.notifications.athleteSignedUp.label',
    i18nDescription: 'profile.notifications.athleteSignedUp.description',
  },
  {
    key: 'athlete_training_today',
    i18nLabel: 'profile.notifications.athleteTrainingToday.label',
    i18nDescription: 'profile.notifications.athleteTrainingToday.description',
  },
  {
    key: 'athlete_medical_cert_expiring',
    i18nLabel: 'profile.notifications.athleteMedicalCertExpiring.label',
    i18nDescription: 'profile.notifications.athleteMedicalCertExpiring.description',
  },
  {
    key: 'athlete_promoted',
    i18nLabel: 'profile.notifications.athletePromoted.label',
    i18nDescription: 'profile.notifications.athletePromoted.description',
  },
  {
    key: 'athlete_payment_marked_paid',
    i18nLabel: 'profile.notifications.athletePaymentMarkedPaid.label',
    i18nDescription: 'profile.notifications.athletePaymentMarkedPaid.description',
  },
  {
    key: 'athlete_payment_overdue',
    i18nLabel: 'profile.notifications.athletePaymentOverdue.label',
    i18nDescription: 'profile.notifications.athletePaymentOverdue.description',
  },
  {
    key: 'community_reply',
    i18nLabel: 'profile.notifications.communityReply.label',
    i18nDescription: 'profile.notifications.communityReply.description',
  },
  {
    key: 'community_new_post',
    i18nLabel: 'profile.notifications.communityNewPost.label',
    i18nDescription: 'profile.notifications.communityNewPost.description',
  },
  {
    key: 'community_comment_on_your_post',
    i18nLabel: 'profile.notifications.communityCommentOnYourPost.label',
    i18nDescription: 'profile.notifications.communityCommentOnYourPost.description',
  },
  {
    key: 'community_reaction_on_your_post',
    i18nLabel: 'profile.notifications.communityReactionOnYourPost.label',
    i18nDescription: 'profile.notifications.communityReactionOnYourPost.description',
  },
  {
    key: 'community_belt_celebration',
    i18nLabel: 'profile.notifications.communityBeltCelebration.label',
    i18nDescription: 'profile.notifications.communityBeltCelebration.description',
  },
  {
    key: 'community_event_new',
    i18nLabel: 'profile.notifications.communityEventNew.label',
    i18nDescription: 'profile.notifications.communityEventNew.description',
  },
];

const TRANSACTIONAL_KEYS: readonly string[] = [
  'welcome',
  'password_reset',
  'email_verification',
  'account_deletion',
  'athlete_invitation',
];

@Component({
  selector: 'app-profile-notifications',
  standalone: true,
  imports: [ButtonModule, FormsModule, ProgressSpinnerModule, ToggleSwitchModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-notifications.component.html',
  styleUrl: './profile-notifications.component.scss',
})
export class ProfileNotificationsComponent implements OnInit {
  private readonly preferencesService = inject(NotificationPreferencesService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly preferences = signal<NotificationPreferences>({});

  protected readonly categories = CATEGORIES;
  protected readonly transactionalKeys = TRANSACTIONAL_KEYS;

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.preferencesService.show().subscribe({
      next: (prefs) => {
        this.preferences.set(prefs);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }

  protected isEnabled(key: string): boolean {
    // Default to enabled when the snapshot is empty / category
    // missing — mirrors the server's default-opt-in.
    const value = this.preferences()[key];
    return value === undefined ? true : value;
  }

  protected onToggle(category: ToggleableCategory, nextValue: boolean): void {
    const prior = this.isEnabled(category.key);
    if (prior === nextValue) return;

    // Optimistic local update so the switch animation feels
    // responsive. Reverted on error.
    this.preferences.update((p) => ({ ...p, [category.key]: nextValue }));
    this.saving.set(category.key);

    this.preferencesService.update({ [category.key]: nextValue }).subscribe({
      next: (snapshot) => {
        this.preferences.set(snapshot);
        this.saving.set(null);
      },
      error: () => {
        this.preferences.update((p) => ({ ...p, [category.key]: prior }));
        this.saving.set(null);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.notifications.saveError.summary'),
          detail: this.translate.instant('profile.notifications.saveError.detail'),
          life: 5000,
        });
      },
    });
  }
}
