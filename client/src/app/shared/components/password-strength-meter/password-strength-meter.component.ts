import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';

/**
 * Password strength feedback bar (#415). Sits under any `p-password`
 * input and renders one of five score buckets (0-4 from zxcvbn-ts)
 * as a coloured bar plus a translatable label.
 *
 * Why zxcvbn-ts:
 *
 * - Length-vs-class-mixing entropy model (NIST SP 800-63B canon)
 *   instead of the classic `min N + must contain symbol` checklist
 *   which actively encourages weak passwords with predictable
 *   substitutions. Krug § self-evidence: the meter tells the user
 *   "this is fine" or "try a longer phrase" without listing arbitrary
 *   character-class rules.
 * - Pure client-side — no network round-trip during typing. The
 *   HIBP breach check is server-side on submit (#415); the meter is
 *   the affordance that nudges the user BEFORE submit.
 *
 * The component is purely presentational: the parent owns the form
 * control + value, this just observes the typed string and renders.
 * Empty input shows nothing — Krug § self-evidence again, no point
 * in flashing "very weak" before the user has typed anything.
 */

zxcvbnOptions.setOptions({
  // Common dictionary applies regardless of locale (top-N leaked
  // passwords, dates, keyboard walks). The English wordlist covers
  // English dictionary words; the IT translation of the strength
  // labels lives in our own i18n bundle, not zxcvbn-ts's
  // `translations` package, so the dictionary stays English even
  // when the SPA is set to Italian.
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  useLevenshteinDistance: true,
});

type Score = 0 | 1 | 2 | 3 | 4;

@Component({
  selector: 'app-password-strength-meter',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-strength-meter.component.html',
  styleUrl: './password-strength-meter.component.scss',
})
export class PasswordStrengthMeterComponent {
  /**
   * Plain-text password value the parent form is currently
   * shepherding. Empty / null → meter renders nothing.
   */
  readonly password = input<string | null | undefined>(null);

  /**
   * Computed score in [0, 4]. zxcvbn-ts is fast (~ms on modern
   * hardware) but we still memoize via the input signal so a
   * change-detection tick that doesn't change the password doesn't
   * re-run the analysis.
   */
  protected readonly score = computed<Score | null>(() => {
    const value = (this.password() ?? '').trim();
    if (value.length === 0) {
      return null;
    }
    const result = zxcvbn(value);
    return result.score as Score;
  });

  /**
   * Translate-key for the bucket label. `meter.bucket.${score}`
   * resolves to "Very weak" / "Weak" / "Reasonable" / "Strong" /
   * "Very strong". The IT translations live in `it.json` lock-step.
   */
  protected readonly labelKey = computed<string | null>(() => {
    const s = this.score();
    return s === null ? null : `auth.passwordMeter.bucket.${s}`;
  });

  /** CSS modifier for the bar fill — colour ramp keyed by score. */
  protected readonly variantClass = computed<string | null>(() => {
    const s = this.score();
    return s === null ? null : `password-meter__bar-fill--score-${s}`;
  });
}
