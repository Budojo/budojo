import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AcademyService, UpdateAcademyPayload } from '../../../core/services/academy.service';

/**
 * Rejects a value that is only whitespace. Without this validator the
 * `required` rule lets a string of spaces through (it's technically "not
 * empty"), but the server trims and then complains with a 422. Mirror the
 * server-side behavior client-side so the message is inline, not a bounce.
 */
const noWhitespace: ValidatorFn = (control: AbstractControl) =>
  control.value?.trim() ? null : { whitespace: true };

/**
 * Academy edit form.
 *
 * Pre-populated from the `AcademyService.academy` signal — no round-trip,
 * no loading state before the form is visible, because `hasAcademyGuard`
 * has already hydrated the cache before we got here. On save we PATCH,
 * the service swaps the signal in-place, and every other consumer (sidebar
 * brand label, detail page) sees the new value in the same tick.
 *
 * The slug is visible but never editable: it's shown as a read-only info
 * line below the name field so the user can SEE what "immutable permalink"
 * means. Norman's signifier rule — explain the constraint at the affordance.
 */
@Component({
  selector: 'app-academy-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TextareaModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './academy-form.component.html',
  styleUrl: './academy-form.component.scss',
})
export class AcademyFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly academyService = inject(AcademyService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  // Snapshot of the slug at component init, kept for the read-only
  // "Permalink" display. Captured as a signal so the template re-renders
  // cleanly if the service signal lands a fraction of a tick late.
  readonly slug = signal<string>('');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255), noWhitespace]],
    address: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    const academy = this.academyService.academy();
    if (!academy) {
      // Defensive: in practice `hasAcademyGuard` prevents this, but a
      // manual `clear()` from devtools or a logout race could race us
      // here. Bail to the detail page — the user will see the empty
      // state there and the guard will redirect on refresh.
      void this.router.navigate(['/dashboard/academy']);
      return;
    }
    this.slug.set(academy.slug);
    this.form.patchValue({
      name: academy.name,
      address: academy.address ?? '',
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.buildPayload();
    this.submitting.set(true);
    this.error.set(null);

    this.academyService
      .update(payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (updated) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Academy updated',
            detail: updated.name,
            life: 3000,
          });
          void this.router.navigate(['/dashboard/academy']);
        },
        error: (err: {
          status?: number;
          error?: { message?: string; errors?: Record<string, string[]> };
        }) => this.handleServerError(err),
      });
  }

  cancel(): void {
    void this.router.navigate(['/dashboard/academy']);
  }

  get name() {
    return this.form.controls.name;
  }

  get address() {
    return this.form.controls.address;
  }

  /**
   * Translate the form state into the wire contract.
   *
   * `address` contract:
   *   - Non-empty string (trimmed) → sent as a string.
   *   - Empty / whitespace-only    → sent as `null` to EXPLICITLY clear
   *     the server-side value (otherwise the user could never remove an
   *     address once set). Distinct from omitting the key, which the
   *     server treats as "leave untouched".
   *
   * We always send both keys on update because the UI is a single edit
   * surface — partial-only would require dirty-tracking per field which
   * is complexity we don't need at this scale.
   */
  private buildPayload(): UpdateAcademyPayload {
    const v = this.form.getRawValue();
    const trimmedAddress = v.address.trim();
    return {
      name: v.name.trim(),
      address: trimmedAddress === '' ? null : trimmedAddress,
    };
  }

  private handleServerError(err: {
    status?: number;
    error?: { message?: string; errors?: Record<string, string[]> };
  }): void {
    if (err.status === 422 && err.error?.errors) {
      const firstError = Object.values(err.error.errors)[0]?.[0];
      this.error.set(firstError ?? err.error.message ?? 'Validation failed.');
      return;
    }
    if (err.status === 403) {
      // The only way to hit this is the cached academy going stale between
      // render and submit (e.g. another tab deleted the academy). Same
      // recovery as the ngOnInit guard: bounce back to detail.
      this.error.set('You no longer have permission to edit this academy.');
      return;
    }
    this.error.set(err.error?.message ?? 'Something went wrong. Please try again.');
  }
}
