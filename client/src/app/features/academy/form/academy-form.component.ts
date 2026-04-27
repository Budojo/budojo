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
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {
  AcademyService,
  Address,
  CountryCode,
  ItalianProvinceCode,
  UpdateAcademyPayload,
} from '../../../core/services/academy.service';
import { TrainingDaysPickerComponent } from '../../../shared/components/training-days-picker/training-days-picker.component';
import {
  COUNTRY_OPTIONS,
  PROVINCE_OPTIONS,
  addressAllOrNothing,
  italianPostalCode,
} from '../../../shared/utils/address-form';

/**
 * Rejects a value that is only whitespace. Without this validator the
 * `required` rule lets a string of spaces through (it's technically "not
 * empty"), but the server trims and then complains with a 422. Mirror the
 * server-side behavior client-side so the message is inline, not a bounce.
 */
const noWhitespace: ValidatorFn = (control: AbstractControl) =>
  control.value?.trim() ? null : { whitespace: true };

@Component({
  selector: 'app-academy-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
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

  readonly slug = signal<string>('');

  readonly provinceOptions = PROVINCE_OPTIONS;
  readonly countryOptions = COUNTRY_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255), noWhitespace]],
    address: this.fb.nonNullable.group(
      {
        line1: ['', Validators.maxLength(255)],
        line2: this.fb.control<string>('', Validators.maxLength(255)),
        city: ['', Validators.maxLength(100)],
        postal_code: ['', italianPostalCode],
        province: this.fb.control<ItalianProvinceCode | ''>(''),
        country: this.fb.nonNullable.control<CountryCode>('IT', Validators.required),
      },
      { validators: addressAllOrNothing },
    ),
    training_days: this.fb.nonNullable.control<number[]>([]),
  });

  ngOnInit(): void {
    const academy = this.academyService.academy();
    if (!academy) {
      void this.router.navigate(['/dashboard/academy']);
      return;
    }
    this.slug.set(academy.slug);
    this.form.patchValue({
      name: academy.name,
      address: {
        line1: academy.address?.line1 ?? '',
        line2: academy.address?.line2 ?? '',
        city: academy.address?.city ?? '',
        postal_code: academy.address?.postal_code ?? '',
        province: academy.address?.province ?? '',
        country: academy.address?.country ?? 'IT',
      },
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

  get addressGroup() {
    return this.form.controls.address;
  }

  get addressLine1() {
    return this.addressGroup.controls.line1;
  }
  get addressLine2() {
    return this.addressGroup.controls.line2;
  }
  get addressCity() {
    return this.addressGroup.controls.city;
  }
  get addressPostalCode() {
    return this.addressGroup.controls.postal_code;
  }
  get addressProvince() {
    return this.addressGroup.controls.province;
  }
  get addressCountry() {
    return this.addressGroup.controls.country;
  }

  /**
   * Map the form state to the wire shape (#72). Three cases:
   *   - All four required address fields empty → `address: null` (clear).
   *   - All four filled → send the structured object.
   *   - Half-filled → form is invalid, never reaches here.
   *
   * The `address: null` path is what lets a user remove an existing
   * address from the academy: clear every field, submit, server deletes
   * the morph row.
   */
  private buildPayload(): UpdateAcademyPayload {
    const v = this.form.getRawValue();
    const a = v.address;

    const line1 = a.line1.trim();
    const city = a.city.trim();
    const postalCode = a.postal_code.trim();
    const province = a.province;

    const allEmpty =
      line1 === '' && city === '' && postalCode === '' && (province === '' || province == null);

    let address: Address | null;
    if (allEmpty) {
      address = null;
    } else {
      const line2 = (a.line2 ?? '').trim();
      address = {
        line1,
        line2: line2 === '' ? null : line2,
        city,
        postal_code: postalCode,
        province: province as ItalianProvinceCode,
        country: a.country,
      };
    }

    return {
      name: v.name.trim(),
      address,
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
      void this.router.navigate(['/dashboard']);
      return;
    }
    this.error.set(err.error?.message ?? 'Something went wrong. Please try again.');
  }
}
