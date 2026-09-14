import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import { Capability, RuntimeService } from '../../../core/services/runtime.service';

// Per-category notification opt-out panel on /dashboard/profile (#416 + #736).
// Email-only when it arrived; since M9 every category ships on the in-app
// inbox channel, and the two owner digests are the only ones that ALSO go out
// by mail — where there is a mail transport at all (#1619).

// Audience cluster for a notification toggle (#736). Owner / athlete / community.
type CategoryGroup = 'owner' | 'athlete' | 'community';

const CATEGORY_GROUPS: readonly CategoryGroup[] = ['owner', 'athlete', 'community'];

// Static map — dynamic template key concat is banned (client/CLAUDE.md § i18n); Record exhaustiveness guards against future CategoryGroup renames.
const GROUP_LABEL_KEYS: Record<CategoryGroup, string> = {
  owner: 'profile.notifications.groups.owner',
  athlete: 'profile.notifications.groups.athlete',
  community: 'profile.notifications.groups.community',
};

interface ToggleableCategory {
  readonly key: string;
  readonly group: CategoryGroup;
  readonly i18nLabel: string;
  readonly i18nDescription: string;
  /**
   * The capability the notification's own dispatch site needs. Absent means
   * it fires on every runtime. A category whose route answers 404 here is a
   * switch wired to nothing, and gets hidden rather than shown (#1619).
   */
  readonly capability?: Capability;
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
    // Fires when an athlete accepts their invitation — a route behind
    // `capability:athlete_accounts`.
    capability: 'athlete_accounts',
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
    // An RSVP is a community event's RSVP; the whole feed is one capability.
    capability: 'community',
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
    capability: 'community',
    i18nLabel: 'profile.notifications.communityReply.label',
    i18nDescription: 'profile.notifications.communityReply.description',
  },
  {
    key: 'community_new_post',
    group: 'community',
    capability: 'community',
    i18nLabel: 'profile.notifications.communityNewPost.label',
    i18nDescription: 'profile.notifications.communityNewPost.description',
  },
  {
    key: 'community_comment_on_your_post',
    group: 'community',
    capability: 'community',
    i18nLabel: 'profile.notifications.communityCommentOnYourPost.label',
    i18nDescription: 'profile.notifications.communityCommentOnYourPost.description',
  },
  {
    key: 'community_reaction_on_your_post',
    group: 'community',
    capability: 'community',
    i18nLabel: 'profile.notifications.communityReactionOnYourPost.label',
    i18nDescription: 'profile.notifications.communityReactionOnYourPost.description',
  },
  {
    key: 'community_belt_celebration',
    group: 'community',
    capability: 'community',
    i18nLabel: 'profile.notifications.communityBeltCelebration.label',
    i18nDescription: 'profile.notifications.communityBeltCelebration.description',
  },
  {
    key: 'community_event_new',
    group: 'community',
    capability: 'community',
    i18nLabel: 'profile.notifications.communityEventNew.label',
    i18nDescription: 'profile.notifications.communityEventNew.description',
  },
];

/**
 * The transactional emails, as whole keys. Building them from a suffix
 * (`'…transactional.' + key`) hid them from the i18n parity check, which is
 * the one trip-wire that keeps EN and IT in lock-step (client/CLAUDE.md
 * § i18n) — the same reason `GROUP_LABEL_KEYS` above is a map.
 */
const TRANSACTIONAL_KEYS: readonly string[] = [
  'profile.notifications.transactional.welcome',
  'profile.notifications.transactional.password_reset',
  'profile.notifications.transactional.email_verification',
  'profile.notifications.transactional.account_deletion',
  'profile.notifications.transactional.athlete_invitation',
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
  private readonly runtime = inject(RuntimeService);

  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly preferences = signal<NotificationPreferences>({});

  protected readonly categories = CATEGORIES;
  protected readonly transactionalKeys = TRANSACTIONAL_KEYS;
  protected readonly groupLabelKey = GROUP_LABEL_KEYS;

  /**
   * Every toggle here survives on a runtime with no mail transport: the
   * owner digests fall back to the in-app inbox on their own
   * (`DeliverOwnerDigestAction`), and everything else has always shipped on
   * the `database` channel. What does NOT survive is the page's own framing
   * — "how it's delivered (email digest, inbox, …)" above a locked list of
   * transactional emails nobody will ever receive (#1619).
   */
  protected readonly hasEmail = computed<boolean>(() => this.runtime.has()('email'));

  /**
   * The groups that still have something in them. On a runtime without the
   * feed that empties the community group entirely; the owner group keeps
   * the four alerts that do not depend on one.
   */
  protected readonly groups = computed<readonly CategoryGroup[]>(() =>
    CATEGORY_GROUPS.filter((group) => this.categoriesForGroup(group).length > 0),
  );

  /**
   * The group's categories, minus the ones this runtime cannot deliver.
   * Reactive on the capability list, so it is safe to read from the template.
   */
  protected categoriesForGroup(group: CategoryGroup): readonly ToggleableCategory[] {
    const has = this.runtime.has();
    return CATEGORIES.filter(
      (c) => c.group === group && (c.capability === undefined || has(c.capability)),
    );
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
