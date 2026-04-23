import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { Belt } from '../../../core/services/athlete.service';

/**
 * Renders the IBJJF belt as a coloured pill. The belt colors are *domain*
 * values — see the SCSS file for the CSS custom properties and the rationale
 * for hardcoding them there (canon's "unless the token truly doesn't exist"
 * clause in client/CLAUDE.md § Design canon).
 */
@Component({
  selector: 'app-belt-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule],
  template: `<p-tag [value]="label()" [style]="style()" [rounded]="true" />`,
  styleUrl: './belt-badge.component.scss',
})
export class BeltBadgeComponent {
  readonly belt = input.required<Belt>();

  readonly label = computed(() => {
    const belt = this.belt();
    return belt.charAt(0).toUpperCase() + belt.slice(1);
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
