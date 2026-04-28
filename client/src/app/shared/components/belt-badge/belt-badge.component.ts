import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { Belt } from '../../../core/services/athlete.service';

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
  imports: [TagModule],
  templateUrl: './belt-badge.component.html',
  styleUrl: './belt-badge.component.scss',
})
export class BeltBadgeComponent {
  readonly belt = input.required<Belt>();
  /**
   * Stripe count, 0–4 (IBJJF max). When omitted or 0, no stripe tiles
   * render — the belt pill stays as before. The stripe slot is always
   * inside the pill so consumers don't need to layout-fix.
   */
  readonly stripes = input<number>(0);

  readonly label = computed(() => {
    const belt = this.belt();
    return belt.charAt(0).toUpperCase() + belt.slice(1);
  });

  /** Stripe count clamped to the IBJJF range — defensive against bad data. */
  readonly stripeTiles = computed(() => {
    const n = Math.max(0, Math.min(4, Math.trunc(this.stripes())));
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
