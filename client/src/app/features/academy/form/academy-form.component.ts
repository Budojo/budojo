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
import { TrainingDaysPickerComponent } from '../../../shared/components/training-days-picker/training-days-picker.component';

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
    TrainingDaysPickerComponent,
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
    training_days: this.fb.nonNullable.control<number[]>([]),
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
      training_days: academy.training_days ?? [],
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
      // Empty selection → null ("not configured") so a user can DEselect
      // every day and have the server clear the schedule (mirror of the
      // address field's "" → null contract).
      training_days: v.training_days.length === 0 ? null : v.training_days,
    };
  }

  setTrainingDays(days: number[]): void {
    this.form.controls.training_days.setValue(days);
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
      // Backend contract: PATCH returns 403 when the user no longer has
      // an academy (GET returns 404 for the same state — asymmetric but
      // baked into the canon). Sitting on the edit form with an inline
      // error would leave the UI in a dead-end: cached signal still
      // points at a now-vanished academy, sidebar still shows its name.
      //
      // AcademyService.update() already cleared the cache in response to
      // the 403. Bouncing to /dashboard triggers `hasAcademyGuard` which
      // re-fetches, receives 404, and redirects to /setup where the user
      // can recreate. Krug forgiveness — every recovery path one click,
      // no hunting around.
      void this.router.navigate(['/dashboard']);
      return;
    }
    this.error.set(err.error?.message ?? 'Something went wrong. Please try again.');
  }
}
