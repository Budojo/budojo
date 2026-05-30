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
 * The header owns the title→body gap via a uniform bottom margin on its
 * host (#1126) — the spacing under the title is identical on every
 * dashboard page. Each page keeps its own card rhythm in a sibling
 * container below the header. Component is purely visual, OnPush.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header" data-cy="page-header">
      <div class="page-header__title-area">
        <div class="page-header__title-row">
          <h1 class="page-header__title" data-cy="page-header-title">{{ title() }}</h1>
          @if (countLabel(); as count) {
            <span class="page-header__count" data-cy="page-header-count">{{ count }}</span>
          }
        </div>
        @if (subtitle(); as s) {
          <p class="page-header__subtitle" data-cy="page-header-subtitle">{{ s }}</p>
        }
      </div>
      <div class="page-header__cta">
        <ng-content select="[pageHeaderCta]" />
      </div>
    </header>
  `,
  styles: [
    `
      /* The header owns the title→body gap for every dashboard page (#1126):
         one uniform value on the host keeps the spacing under the title
         identical everywhere, while each page keeps its own card rhythm in a
         sibling __body container below the header. */
      :host {
        display: block;
        margin-bottom: 0.5rem;
      }

      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        /* Keep the CTA inline with the title (#1147). A long title wraps its
           OWN text within the title column rather than dropping the CTA to a
           second line — so the title/CTA layout stays consistent page-to-page
           instead of depending on how long the title happens to be. */
        flex-wrap: nowrap;
      }

      .page-header__title-area {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
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
        /* With the CTA pinned inline (#1147), an unbreakable user-input title
           (e.g. a spaceless academy name) must be able to break inside a word
           as a last resort instead of spilling over the CTA at 375px. No-op on
           normal spaced titles. */
        overflow-wrap: anywhere;
      }

      .page-header__count {
        font-size: 0.875rem;
        color: var(--p-surface-500);
      }

      .page-header__subtitle {
        margin: 0;
        font-size: 0.875rem;
        color: var(--p-surface-500);
        line-height: 1.3;
      }

      .page-header__cta {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
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
  readonly subtitle = input<string | null>(null);
}
