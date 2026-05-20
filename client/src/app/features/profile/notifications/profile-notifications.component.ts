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

/**
 * Audience cluster for a notification toggle (#736). Phases A+B+C grew the
 * panel to 17 toggles in one scrolling list; the user couldn't reach the
 * bottom on mobile. Each toggle now declares which audience it belongs to:
 *
 *  - `owner`     — alerts the academy owner cares about (medical-cert
 *                  reminders, unpaid digest, athlete onboarding events).
 *  - `athlete`   — personal alerts that fire on the caller's own row
 *                  (training reminders, payment status, promotions).
 *  - `community` — feed-driven alerts (replies, comments, reactions).
 *
 * The template renders one `<details>` per group and starts collapsed.
 */
type CategoryGroup = 'owner' | 'athlete' | 'community';

const CATEGORY_GROUPS: readonly CategoryGroup[] = ['owner', 'athlete', 'community'];

interface ToggleableCategory {
  readonly key: string;
  readonly group: CategoryGroup;
  readonly i18nLabel: string;
  readonly i18nDescription: string;
}

const CATEGORIES: readonly ToggleableCategory[] = [
  // ── Owner ─────────────────────────────────────────────────────────────
  {
    key: 'medical_cert_expiry_reminders',
    group: 'owner',
    i18nLabel: 'profile.notifications.medicalCertReminders.label',
    i18nDescription: 'profile.notifications.medicalCertReminders.description',
  },
  {
    key: 'unpaid_athletes_digest',
    group: 'owner',
    i18nLabel: 'profile.notifications.unpaidAthletesDigest.label',
    i18nDescription: 'profile.notifications.unpaidAthletesDigest.description',
  },
  {
    key: 'athlete_signed_up',
    group: 'owner',
    i18nLabel: 'profile.notifications.athleteSignedUp.label',
    i18nDescription: 'profile.notifications.athleteSignedUp.description',
  },
  {
    key: 'owner_athlete_doc_uploaded',
    group: 'owner',
    i18nLabel: 'profile.notifications.ownerAthleteDocUploaded.label',
    i18nDescription: 'profile.notifications.ownerAthleteDocUploaded.description',
  },
  {
    key: 'owner_event_rsvp',
    group: 'owner',
    i18nLabel: 'profile.notifications.ownerEventRsvp.label',
    i18nDescription: 'profile.notifications.ownerEventRsvp.description',
  },
  {
    key: 'owner_athlete_missed_streak',
    group: 'owner',
    i18nLabel: 'profile.notifications.ownerAthleteMissedStreak.label',
    i18nDescription: 'profile.notifications.ownerAthleteMissedStreak.description',
  },
  // ── Athlete personal ──────────────────────────────────────────────────
  {
    key: 'athlete_training_today',
    group: 'athlete',
    i18nLabel: 'profile.notifications.athleteTrainingToday.label',
    i18nDescription: 'profile.notifications.athleteTrainingToday.description',
  },
  {
    key: 'athlete_medical_cert_expiring',
    group: 'athlete',
    i18nLabel: 'profile.notifications.athleteMedicalCertExpiring.label',
    i18nDescription: 'profile.notifications.athleteMedicalCertExpiring.description',
  },
  {
    key: 'athlete_promoted',
    group: 'athlete',
    i18nLabel: 'profile.notifications.athletePromoted.label',
    i18nDescription: 'profile.notifications.athletePromoted.description',
  },
  {
    key: 'athlete_payment_marked_paid',
    group: 'athlete',
    i18nLabel: 'profile.notifications.athletePaymentMarkedPaid.label',
    i18nDescription: 'profile.notifications.athletePaymentMarkedPaid.description',
  },
  {
    key: 'athlete_payment_overdue',
    group: 'athlete',
    i18nLabel: 'profile.notifications.athletePaymentOverdue.label',
    i18nDescription: 'profile.notifications.athletePaymentOverdue.description',
  },
  // ── Community ─────────────────────────────────────────────────────────
  {
    key: 'community_reply',
    group: 'community',
    i18nLabel: 'profile.notifications.communityReply.label',
    i18nDescription: 'profile.notifications.communityReply.description',
  },
  {
    key: 'community_new_post',
    group: 'community',
    i18nLabel: 'profile.notifications.communityNewPost.label',
    i18nDescription: 'profile.notifications.communityNewPost.description',
  },
  {
    key: 'community_comment_on_your_post',
    group: 'community',
    i18nLabel: 'profile.notifications.communityCommentOnYourPost.label',
    i18nDescription: 'profile.notifications.communityCommentOnYourPost.description',
  },
  {
    key: 'community_reaction_on_your_post',
    group: 'community',
    i18nLabel: 'profile.notifications.communityReactionOnYourPost.label',
    i18nDescription: 'profile.notifications.communityReactionOnYourPost.description',
  },
  {
    key: 'community_belt_celebration',
    group: 'community',
    i18nLabel: 'profile.notifications.communityBeltCelebration.label',
    i18nDescription: 'profile.notifications.communityBeltCelebration.description',
  },
  {
    key: 'community_event_new',
    group: 'community',
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
  protected readonly groups = CATEGORY_GROUPS;

  /**
   * Return the toggles that belong to a given audience group (#736).
   * Filtering is done at render time off the static CATEGORIES list so
   * the order of toggles inside each group matches the array order — no
   * separate sort needed.
   */
  protected categoriesForGroup(group: CategoryGroup): readonly ToggleableCategory[] {
    return CATEGORIES.filter((c) => c.group === group);
  }

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
