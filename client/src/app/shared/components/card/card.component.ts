import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Canonical card shell — surface 0 + hairline border + 12px radius
 * + 8dp-grid spacing + motion-fast hover (#1038).
 *
 * Audit Sprint 4 (2026-05-25) catalogued 6 hand-rolled card shells
 * across athletes-list, my-feed, attendance-daily, documents-list,
 * achievement-badge, notification-bell — each ~30 lines of SCSS
 * declaring the same visual contract with subtle off-by-one drift
 * (some 0.875rem padding, some 1rem; some 0.625rem gap, some 0.75rem;
 * one off the 8dp grid entirely).
 *
 * This component extracts the visual chrome + 3 named slots:
 *
 *   - **`header`** — title row, kebab menu, status pill;
 *   - **`body`** — feature-specific content (the only part that
 *     should differ between card types);
 *   - **`footer`** — actions / reactions / RSVP chips.
 *
 * Slots are CSS-grid-friendly via `<ng-content select="...">` —
 * the consumer just nests `<section header>`, `<section body>`,
 * `<section footer>` inside `<app-card>`. The component doesn't
 * inspect content; everything is layout primitive.
 *
 * The `active` input flips the hover-bg tint. Use it for
 * present-state highlight (`is_self` chip, currently-marked
 * attendance row, etc.) — NOT for click feedback (the host's
 * `<a>` / `<button>` handles that natively).
 *
 * @example
 * ```html
 * <app-card [active]="athlete.is_self">
 *   <section header>
 *     <h3>{{ athlete.first_name }} {{ athlete.last_name }}</h3>
 *     <button class="kebab" ...>⋮</button>
 *   </section>
 *   <section body>
 *     <app-belt-badge [belt]="athlete.belt" />
 *   </section>
 *   <section footer>
 *     <app-paid-badge [paid]="athlete.paid_current_month" />
 *   </section>
 * </app-card>
 * ```
 */
@Component({
  selector: 'app-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card" [class.card--active]="active()" [attr.data-cy]="dataCy() ?? null">
      <ng-content select="[header]"></ng-content>
      <ng-content select="[body]"></ng-content>
      <ng-content select="[footer]"></ng-content>
    </div>
  `,
  styles: [
    `
      .card {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        background: var(--p-content-background);
        border: 1px solid var(--p-content-border-color);
        border-radius: 12px;
        transition: background var(--budojo-motion-fast) var(--budojo-motion-decelerate);
      }

      .card--active {
        background: var(--p-content-hover-background);
      }

      /* Slot defaults — consumers can override per-feature with
         scoped CSS on their host element, but the column-flex +
         inherited gap shape is the canon. */
      ::ng-deep [header],
      ::ng-deep [body],
      ::ng-deep [footer] {
        display: flex;
        flex-direction: column;
        gap: inherit;
      }
    `,
  ],
})
export class CardComponent {
  /** Optional active tint — present-state, NOT click feedback. */
  readonly active = input<boolean>(false);
  /** Cypress hook. */
  readonly dataCy = input<string | null>(null);
}
