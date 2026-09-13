import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { LanguageService } from '../../../core/services/language.service';
import { localeFor } from '../../utils/locale';

/**
 * Compact age chip rendered next to athlete names. Computes age from a
 * `YYYY-MM-DD` date-of-birth string client-side — no backend round-trip
 * needed for a value that derives from a pure function of two dates.
 *
 * Tooltip shows the full DOB so the user can verify the number without
 * navigating to the detail page (Norman feedback: every signifier
 * carries its own provenance on hover).
 *
 * When DOB is empty or invalid, the computed `years` value returns `null`
 * and the component's internal `@if` block renders nothing — so the caller
 * doesn't have to wrap the element in `@if`. Pass the optional value
 * through and let the badge decide whether to render.
 */
@Component({
  selector: 'app-age-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule, Tooltip],
  template: `
    @if (years(); as y) {
      <p-tag
        [value]="label()"
        severity="secondary"
        [rounded]="true"
        [pTooltip]="dobLabel()"
        tooltipPosition="top"
        styleClass="age-badge"
      />
    }
  `,
  styleUrl: './age-badge.component.scss',
})
export class AgeBadgeComponent {
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  /** ISO `YYYY-MM-DD`. May be null/empty when the athlete has no DOB on file. */
  readonly dateOfBirth = input<string | null | undefined>(null);

  /** Whole-year age. `null` when DOB is missing or the year is in the future. */
  protected readonly years = computed<number | null>(() => {
    const dob = this.dateOfBirth();
    if (!dob) return null;
    const parsed = parseDob(dob);
    if (!parsed) return null;
    const today = new Date();
    let age = today.getFullYear() - parsed.year;
    // Subtract a year if the birthday hasn't happened yet this calendar year.
    const beforeBirthday =
      today.getMonth() + 1 < parsed.month ||
      (today.getMonth() + 1 === parsed.month && today.getDate() < parsed.day);
    if (beforeBirthday) age -= 1;
    return age >= 0 ? age : null;
  });

  /**
   * The chip's own text. It was `years + 'y'` — a unit built in code, which
   * meant an Italian roster read "32y" beside every name and no translation
   * could reach it (#1623). Through the plural pair instead: "32 anni",
   * "1 anno", and the same "32y" in English where the letter is idiomatic.
   */
  protected readonly label = computed<string>(() => {
    this.languageService.currentLang();
    const years = this.years();
    if (years === null) return '';
    return this.translate.instant(
      years === 1 ? 'shared.ageBadge.valueOne' : 'shared.ageBadge.valueOther',
      { years },
    ) as string;
  });

  /** Long-form date for the tooltip — e.g. "15 May 1990". */
  protected readonly dobLabel = computed<string>(() => {
    const dob = this.dateOfBirth();
    if (!dob) return '';
    const parsed = parseDob(dob);
    if (!parsed) return '';
    const d = new Date(parsed.year, parsed.month - 1, parsed.day);
    const locale = localeFor(this.languageService.currentLang());
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  });
}

function parseDob(dob: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}
