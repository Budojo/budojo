import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

/**
 * Standardised empty state for any list / panel / dashboard widget
 * with no rows to show (#1036).
 *
 * Audit Sprint 3 (2026-05-25) catalogued 4 different shapes for
 * "this list is empty" across athletes-list, attendance-daily,
 * documents-list, my-feed, stats, expiring-documents — some had
 * a `pi pi-*` icon + text, some text-only, some a `--empty-state`
 * div with no icon. This component collapses all of them onto
 * one shape: icon + title + optional hint + optional CTA.
 *
 * Conventions baked in:
 *
 *   - **Centered column** layout (Krug — the eye drops to the middle
 *     when a list is empty; no surrounding chrome to ground it on).
 *   - **Icon is a `pi pi-*` glyph** rendered at 3rem in a muted
 *     surface tone. No illustrations — those rot quickly and a
 *     consistent icon vocabulary survives palette rewrites.
 *   - **`data-cy` defaults to `{root}-empty`** (passed by the parent)
 *     so the Cypress hook convention stays uniform across features.
 *   - **CTA optional**: omitting it produces a quiet empty state
 *     (most cases — the user already knows how to add a row from
 *     elsewhere on the page); passing it lights up an inline primary
 *     button for first-time onboarding states (`Aggiungi il primo
 *     atleta`).
 *
 * @example
 * ```html
 * <app-empty-state
 *   icon="pi pi-users"
 *   [title]="'athletes.empty.title' | translate"
 *   [hint]="'athletes.empty.hint' | translate"
 *   [ctaLabel]="'athletes.empty.addFirst' | translate"
 *   (ctaClick)="goToNew()"
 *   dataCy="athletes-empty"
 * />
 * ```
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule],
  template: `
    <div class="empty-state" [attr.data-cy]="dataCy() ?? null">
      <i class="empty-state__icon {{ icon() }}" aria-hidden="true"></i>
      <!-- Heading level is host-driven (#1042 reviewer) — default h2; consumers override via headingLevel. -->
      @switch (headingLevel()) {
        @case (1) {
          <h1 class="empty-state__title">{{ title() }}</h1>
        }
        @case (3) {
          <h3 class="empty-state__title">{{ title() }}</h3>
        }
        @case (4) {
          <h4 class="empty-state__title">{{ title() }}</h4>
        }
        @default {
          <h2 class="empty-state__title">{{ title() }}</h2>
        }
      }
      @if (hint(); as hintText) {
        <p class="empty-state__hint">{{ hintText }}</p>
      }
      @if (ctaLabel(); as label) {
        <p-button
          type="button"
          severity="primary"
          size="small"
          [label]="label"
          [icon]="ctaIcon()"
          (onClick)="ctaClick.emit()"
          [attr.data-cy]="dataCy() ? dataCy() + '-cta' : null"
        />
      }
    </div>
  `,
  styles: [
    `
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 2.5rem 1rem;
        text-align: center;
        color: var(--p-text-muted-color);
      }

      .empty-state__icon {
        font-size: 3rem;
        color: var(--p-surface-400);
        margin-bottom: 0.5rem;
      }

      .empty-state__title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--p-text-color);
      }

      .empty-state__hint {
        margin: 0;
        font-size: 0.875rem;
        max-width: 28rem;
      }

      p-button {
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class EmptyStateComponent {
  /** `pi pi-*` glyph. Defaults to a neutral inbox icon. */
  readonly icon = input<string>('pi pi-inbox');
  /** Required. Headline visible to the user — already translated. */
  readonly title = input.required<string>();
  /** Heading element level for the title (1–4). Default h2 — the host can lift to h1 (top-level page) or push to h3/h4 (deep widget) so the document outline stays sane. */
  readonly headingLevel = input<1 | 2 | 3 | 4>(2);
  /** Optional sub-line. */
  readonly hint = input<string | null>(null);
  /** Optional CTA label. When omitted, no button renders. */
  readonly ctaLabel = input<string | null>(null);
  /** Optional CTA icon. Defaults to plus when only a label is given. */
  readonly ctaIcon = input<string>('pi pi-plus');
  /** Cypress hook. By convention `{feature}-empty`. */
  readonly dataCy = input<string | null>(null);

  /** Fires when the user clicks the optional CTA. */
  readonly ctaClick = output<void>();
}
