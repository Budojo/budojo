import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Canonical form-field wrapper — label, required marker, hint, error
 * (#1039). Audit Sprint 5 (2026-05-25) catalogued 8 hand-rolled
 * shapes across login / register / academy-form / athletes-form /
 * me-profile / change-email-card / change-password-card and the
 * filter-sheet — each declared label position, required marker,
 * hint typography and error tone slightly differently. The
 * shape-drift is the kind that adds up to "this form feels off"
 * without any single offender being wrong.
 *
 * The wrapper bakes in:
 *
 *   - Stacked layout (label above field — MD3 + Krug's "labels
 *     answer 'what is this for?' before the eye reaches the input").
 *   - Required marker `*` (aria-hidden — the underlying control's
 *     `required` attr is the SR-accessible signal).
 *   - One slot for the actual control (`<ng-content>`) — usually a
 *     `p-inputtext`, `p-password`, `p-dropdown`, `p-calendar`, or
 *     plain `<input>` / `<textarea>`. The wrapper does not touch
 *     the control's appearance — just frames it.
 *   - Mutually exclusive hint / error (`error` wins — Norman §
 *     feedback: don't compete signals).
 *   - `aria-describedby` wiring via `controlId` so screen readers
 *     announce the hint or error when the slotted control receives
 *     focus.
 *
 * The consumer is responsible for wiring `aria-describedby` on the
 * actual control element — the wrapper renders a `<small>` with a
 * deterministic id (`{controlId}-hint` / `{controlId}-error`) so the
 * consumer can drop a one-line `[attr.aria-describedby]` binding.
 *
 * @example
 * ```html
 * <app-budojo-form-field
 *   label="Email address"
 *   [required]="true"
 *   [error]="form.controls.email.touched && form.controls.email.errors?.['required']
 *     ? ('forms.errors.required' | translate) : null"
 *   hint="We will use this to reach you."
 *   controlId="email-input"
 * >
 *   <input
 *     id="email-input"
 *     type="email"
 *     pInputText
 *     formControlName="email"
 *     [attr.aria-describedby]="form.controls.email.errors ? 'email-input-error' : 'email-input-hint'"
 *   />
 * </app-budojo-form-field>
 * ```
 */
@Component({
  selector: 'app-budojo-form-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="budojo-form-field" [attr.data-cy]="dataCy() ?? null">
      <label class="budojo-form-field__label" [attr.for]="controlId() || null">
        {{ label() }}
        @if (required()) {
          <span class="budojo-form-field__required" aria-hidden="true">*</span>
        }
        @if (optionalLabel()) {
          <span class="budojo-form-field__optional">{{ optionalLabel() }}</span>
        }
      </label>
      <div class="budojo-form-field__control">
        <ng-content></ng-content>
      </div>
      @if (error()) {
        <small
          class="budojo-form-field__error"
          role="alert"
          [id]="errorId()"
          [attr.data-cy]="dataCy() ? dataCy() + '-error' : null"
          >{{ error() }}</small
        >
      } @else if (hint()) {
        <small class="budojo-form-field__hint" [id]="hintId()">{{ hint() }}</small>
      }
    </div>
  `,
  styles: [
    `
      .budojo-form-field {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .budojo-form-field__label {
        font-size: var(--budojo-form-label-size, 0.875rem);
        font-weight: 500;
        color: var(--p-text-color);
      }

      .budojo-form-field__required {
        margin-left: 0.25rem;
        color: var(--p-form-field-invalid-border-color, var(--budojo-error, #ff453a));
      }

      /* Muted, smaller "Optional" affordance — the inverse signifier of
         the required marker. Lets a form distinguish must-fill from
         may-fill fields without a tooltip (Norman § signifier). */
      .budojo-form-field__optional {
        margin-left: 0.5rem;
        font-size: var(--budojo-form-error-size, 0.75rem);
        font-weight: 400;
        color: var(--p-text-muted-color);
      }

      .budojo-form-field__hint {
        font-size: var(--budojo-form-error-size, 0.75rem);
        color: var(--p-text-muted-color);
      }

      .budojo-form-field__error {
        font-size: var(--budojo-form-error-size, 0.75rem);
        color: var(--p-form-field-invalid-border-color, var(--budojo-error, #ff453a));
      }
    `,
  ],
})
export class BudojoFormFieldComponent {
  /** Required label — the question the field is answering. */
  readonly label = input.required<string>();
  /** Required field marker (renders `*` aria-hidden). */
  readonly required = input<boolean>(false);
  /**
   * Optional-field affordance. Pass the already-translated word
   * (e.g. `'athletes.form.optional' | translate` → "Optional"); when
   * set, a muted marker renders after the label. Mutually exclusive
   * with `required` in practice — a field is one or the other.
   */
  readonly optionalLabel = input<string | null>(null);
  /** Inline error message. Mutually exclusive with hint — error wins. */
  readonly error = input<string | null>(null);
  /** Hint sub-line (helper text). */
  readonly hint = input<string | null>(null);
  /** id of the slotted control element. Used for label[for] + describedby ids. */
  readonly controlId = input<string>('');
  /** Cypress hook. */
  readonly dataCy = input<string | null>(null);

  protected readonly hintId = computed(() => `${this.controlId()}-hint`);
  protected readonly errorId = computed(() => `${this.controlId()}-error`);
}
