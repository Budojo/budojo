import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';

import { ConsentCategory, ConsentService } from '../../core/services/consent.service';

interface CategoryRow {
  readonly key: ConsentCategory;
  /** i18n key under `cookies.categories.<key>.label`. */
  readonly labelKey: string;
  /** i18n key under `cookies.categories.<key>.description`. */
  readonly descriptionKey: string;
  /** When `true` the checkbox is disabled and forced on (essential). */
  readonly locked: boolean;
}

/**
 * Sticky cookie consent banner + Customise modal (#421).
 *
 * Mounted once at the app root and renders only when
 * `ConsentService.decided()` is `false` — that is, on first visit, after
 * a `CONSENT_VERSION` bump, or after the user explicitly hits "Manage
 * preferences" from the cookie policy page.
 *
 * Three primary CTAs match the EU e-Privacy directive minimum:
 *   - Accept all → analytics + marketing + preferences ON.
 *   - Reject non-essential → only essential ON.
 *   - Customise → opens a `p-dialog` with a checkbox per category.
 *
 * The "essential" checkbox is locked on (canon § Norman, "constraint"):
 * a control that cannot legally be turned off must look so. The
 * service double-enforces the lock so a hostile caller cannot flip it
 * via a programmatic save.
 */
@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [TranslatePipe, RouterLink, ButtonModule, DialogModule, CheckboxModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cookie-banner.component.html',
  styleUrl: './cookie-banner.component.scss',
})
export class CookieBannerComponent {
  private readonly consent = inject(ConsentService);

  /** Visible only while undecided. The CSS pin layer applies on top. */
  readonly visible = computed(() => !this.consent.decided());

  /** Customise dialog open/closed. Not persisted — local UI state only. */
  protected readonly customiseOpen = signal(false);

  /**
   * Working copy of the choices while the Customise modal is open.
   * Detached from the persisted state so the user can toggle around
   * and only commit on "Save". Cancel discards.
   *
   * `essential` is mirrored here just so the checkbox row can read a
   * consistent shape, but the service ignores it on save.
   */
  protected readonly draft = signal({
    essential: true,
    preferences: false,
    analytics: false,
    marketing: false,
  });

  /**
   * Fixed declaration of the four categories we surface. Order matches
   * the EU directive intent (essential first, then opt-in, with the
   * non-trackers grouped at the bottom). Locked-on flag drives the
   * disabled state on the checkbox.
   */
  protected readonly categories: readonly CategoryRow[] = [
    {
      key: 'essential',
      labelKey: 'cookies.categories.essential.label',
      descriptionKey: 'cookies.categories.essential.description',
      locked: true,
    },
    {
      key: 'preferences',
      labelKey: 'cookies.categories.preferences.label',
      descriptionKey: 'cookies.categories.preferences.description',
      locked: false,
    },
    {
      key: 'analytics',
      labelKey: 'cookies.categories.analytics.label',
      descriptionKey: 'cookies.categories.analytics.description',
      locked: false,
    },
    {
      key: 'marketing',
      labelKey: 'cookies.categories.marketing.label',
      descriptionKey: 'cookies.categories.marketing.description',
      locked: false,
    },
  ];

  acceptAll(): void {
    this.consent.acceptAll();
  }

  rejectNonEssential(): void {
    this.consent.rejectNonEssential();
  }

  openCustomise(): void {
    // Seed the draft from the current persisted state so a re-opener
    // (cookie-policy "Manage preferences" link) sees their own choices.
    this.draft.set({ ...this.consent.choices() });
    this.customiseOpen.set(true);
  }

  closeCustomise(): void {
    this.customiseOpen.set(false);
  }

  saveCustomise(): void {
    const next = this.draft();
    this.consent.save({
      preferences: next.preferences,
      analytics: next.analytics,
      marketing: next.marketing,
    });
    this.customiseOpen.set(false);
  }

  /**
   * Used by the template's `[(ngModel)]` binding on the per-category
   * checkbox. Writing through a setter keeps the signal-mediated
   * update path while staying compatible with `FormsModule` two-way
   * binding (Angular's signal-form integration is still pre-stable).
   */
  protected setDraft(key: ConsentCategory, value: boolean): void {
    if (key === 'essential') return;
    this.draft.update((current) => ({ ...current, [key]: value }));
  }

  protected getDraft(key: ConsentCategory): boolean {
    return this.draft()[key];
  }
}
