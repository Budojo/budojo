import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shared dashboard page header (#883). Single row pattern carried over
 * from the athletes-list page that was already the canonical shape —
 * title H1 + optional count chip + optional CTA slot, all baseline-
 * aligned on one line. Wraps to two lines on narrow viewports.
 *
 * Inputs:
 *   - `title` (required): the H1 label, already translated by the caller.
 *   - `countLabel` (optional): a small muted chip rendered next to the
 *     title — typical use is "12 totali" / "3 da controllare", already
 *     translated + pluralized by the caller. Hidden when empty / null.
 *
 * Content projection slot `[pageHeaderCta]` for the primary CTA button.
 * Pages that have no CTA just omit it; the header collapses cleanly.
 *
 * The header itself has no extra outer margin — the parent page's grid
 * decides how much vertical room it gets. Component is purely visual,
 * OnPush.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header" data-cy="page-header">
      <div class="page-header__title-area">
        @if (eyebrow(); as e) {
          <p class="page-header__eyebrow" data-cy="page-header-eyebrow">{{ e }}</p>
        }
        <div class="page-header__title-row">
          <h1 class="page-header__title" data-cy="page-header-title">{{ title() }}</h1>
          @if (countLabel(); as count) {
            <span class="page-header__count" data-cy="page-header-count">{{ count }}</span>
          }
        </div>
      </div>
      <div class="page-header__cta">
        <ng-content select="[pageHeaderCta]" />
      </div>
    </header>
  `,
  styles: [
    `
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }

      .page-header__title-area {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
      }

      .page-header__eyebrow {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--p-surface-500);
        line-height: 1;
      }

      .page-header__title-row {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
      }

      .page-header__title {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--p-surface-900);
        line-height: 1.2;
      }

      .page-header__count {
        font-size: 0.875rem;
        color: var(--p-surface-500);
      }

      .page-header__cta {
        display: inline-flex;
        align-items: center;
      }

      .page-header__cta:empty {
        display: none;
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly countLabel = input<string | null>(null);
  readonly eyebrow = input<string | null>(null);
}
