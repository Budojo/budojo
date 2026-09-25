import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { ClassRegular, ClassRegulars } from '../../../../core/services/attendance.service';
import { LanguageService } from '../../../../core/services/language.service';
import { AthleteIdentityComponent } from '../../../../shared/components/athlete-identity/athlete-identity.component';
import { ContactActionsComponent } from '../../../../shared/components/contact-actions/contact-actions.component';
import { relativeDay } from '../../../../shared/utils/relative-day';

/** Fewer occurrences than this and the server names nobody (#1730). */
const OCCURRENCES_NEEDED = 3;

type PanelState = 'hidden' | 'error' | 'not-enough' | 'all-here' | 'missing';

interface MissingRow {
  readonly regular: ClassRegular;
  readonly name: string;
  /** "a week ago", or null for a regular never seen before the evening. */
  readonly lastSeen: string | null;
}

/**
 * Who usually comes to this class and is not here tonight (#1730).
 *
 * Presentational: the check-in fetches the class's regulars once per
 * (day, class) and passes who it already has on the mat. The subtraction
 * happens here, so a tick takes someone off the list on the same frame,
 * with nothing asked of the server.
 *
 * Folded by default, below the table: the register is what the screen is
 * for, and the header's count is enough to know whether to open it.
 */
@Component({
  selector: 'app-missing-regulars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AthleteIdentityComponent, ContactActionsComponent],
  templateUrl: './missing-regulars.component.html',
  styleUrl: './missing-regulars.component.scss',
})
export class MissingRegularsComponent {
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  /** The class's regulars, or null while the answer is on its way. */
  readonly regulars = input.required<ClassRegulars | null>();

  /** Who is on the mat, keyed by athlete id — the check-in's present-map. */
  readonly present = input.required<ReadonlyMap<number, unknown>>();

  /** The request failed. */
  readonly failed = input<boolean>(false);

  /** Ask again, after a failure. */
  readonly retry = output<void>();

  protected readonly expanded = signal(false);

  private readonly missing = computed<readonly ClassRegular[]>(() => {
    const present = this.present();
    return (this.regulars()?.data ?? []).filter((r) => !present.has(r.id));
  });

  protected readonly occurrences = computed<number>(() => this.regulars()?.meta.occurrences ?? 0);

  protected readonly state = computed<PanelState>(() => {
    if (this.failed()) return 'error';
    if (this.regulars() === null) return 'hidden';
    // Too little history is its own answer, never "everyone is here".
    if (this.occurrences() < OCCURRENCES_NEEDED) return 'not-enough';
    return this.missing().length === 0 ? 'all-here' : 'missing';
  });

  protected readonly countKey = computed<string>(() =>
    this.missing().length === 1
      ? 'attendance.daily.missing.countOne'
      : 'attendance.daily.missing.countOther',
  );

  protected readonly notEnoughKey = computed<string>(() => {
    const found = this.occurrences();
    if (found === 0) return 'attendance.daily.missing.noHistory';
    return found === 1
      ? 'attendance.daily.missing.notEnoughHistoryOne'
      : 'attendance.daily.missing.notEnoughHistoryOther';
  });

  protected readonly rows = computed<readonly MissingRow[]>(() => {
    // Read so the distances re-render in the new language.
    this.languageService.currentLang();
    return this.missing().map((regular) => ({
      regular,
      name: `${regular.first_name} ${regular.last_name}`,
      lastSeen: regular.last_attended_on
        ? relativeDay(regular.last_attended_on, this.translate)
        : null,
    }));
  });

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }
}
