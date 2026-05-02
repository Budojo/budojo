import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';
import { Belt, MAX_STRIPES_PER_BELT } from '../../../core/services/athlete.service';

const BELT_KEYS: Readonly<Record<Belt, string>> = {
  grey: 'belts.grey',
  yellow: 'belts.yellow',
  orange: 'belts.orange',
  green: 'belts.green',
  white: 'belts.white',
  blue: 'belts.blue',
  purple: 'belts.purple',
  brown: 'belts.brown',
  black: 'belts.black',
  'red-and-black': 'belts.redAndBlack',
  'red-and-white': 'belts.redAndWhite',
  red: 'belts.red',
};

/**
 * Renders the IBJJF belt as a coloured pill, optionally with stripe markers
 * inline. The belt colors are *domain* values — see the SCSS file for the
 * CSS custom properties and the rationale for hardcoding them there (canon's
 * "unless the token truly doesn't exist" clause in client/CLAUDE.md §
 * Design canon).
 *
 * Stripes are rendered as small filled tiles inside the pill, after the
 * belt label (#165). White-belt rows use dark tiles; coloured rows use
 * light tiles — so the stripe count is glanceable on every belt without
 * a separate column.
 */
@Component({
  selector: 'app-belt-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule, TranslatePipe],
  templateUrl: './belt-badge.component.html',
  styleUrl: './belt-badge.component.scss',
})
export class BeltBadgeComponent {
  readonly belt = input.required<Belt>();
  /**
   * Stripe count. IBJJF max is 4 for every belt EXCEPT black, which
   * carries 1°-6° grau as 1-6 stripes (#229). Defensive clamp at 6
   * prevents bogus DB values from blowing the layout — any real-world
   * value over 6 indicates corruption upstream.
   */
  readonly stripes = input<number>(0);

  readonly labelKey = computed(() => BELT_KEYS[this.belt()]);

  /**
   * Stripe count clamped to the SELECTED belt's cap (#229 review).
   * Uses the same `MAX_STRIPES_PER_BELT` source the form picker reads,
   * so display stays consistent with validation: a stale `stripes=6`
   * on a non-black belt renders 4 tiles, not 6 — matching what the
   * server-side cross-field validator would reject on next write.
   */
  readonly stripeTiles = computed(() => {
    const cap = MAX_STRIPES_PER_BELT[this.belt()];
    const n = Math.max(0, Math.min(cap, Math.trunc(this.stripes())));
    return Array.from({ length: n });
  });

  /**
   * Resolves the badge colors by referencing CSS custom properties defined
   * on `:host` in the SCSS file. No hex values live in this TS file — the
   * design canon keeps hex out of component TS so that a single shared
   * presentational component doesn't leak raw colors across the app; the
   * SCSS file is where the domain-color exception is documented.
   */
  readonly style = computed<Record<string, string>>(() => {
    const belt = this.belt();
    return {
      background: `var(--budojo-belt-${belt}-bg)`,
      color: `var(--budojo-belt-${belt}-fg)`,
    };
  });
}
