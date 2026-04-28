import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { InputGroupModule } from 'primeng/inputgroup';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { Tooltip } from 'primeng/tooltip';
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

/**
 * Cross-field rule for the (#161) phone pair. When the SIBLING control has a
 * value, this control becomes required. Mirrors the same shape used by the
 * athlete form (#75) — the rule isn't extracted to a shared util yet because
 * we only have two consumers; revisit when the third one lands.
 *
 * The validator reads the sibling lazily through `control.parent` rather than
 * capturing a control reference at construction time — at the moment the
 * validator is created the parent FormGroup doesn't exist yet.
 */
function phonePairRequired(siblingName: string): ValidatorFn {
  return (control: AbstractControl) => {
    const parent = control.parent;
    if (!parent) return null;
    const sibling = parent.get(siblingName);
    if (!sibling) return null;
    const own = (control.value ?? '').toString().trim();
    const other = (sibling.value ?? '').toString().trim();
    return other !== '' && own === '' ? { phonePairRequired: true } : null;
  };
}

interface SelectOption<T extends string> {
  label: string;
  value: T;
}

/**
 * Curated country-code list. Italy-first because it's the primary market;
 * the rest covers the typical European + transatlantic mix we see at BJJ
 * academies. Mirrors the athlete form's list verbatim — drift would be a bug.
 */
const COUNTRY_CODE_OPTIONS: SelectOption<string>[] = [
  { label: '+39 Italy', value: '+39' },
  { label: '+33 France', value: '+33' },
  { label: '+34 Spain', value: '+34' },
  { label: '+44 United Kingdom', value: '+44' },
  { label: '+49 Germany', value: '+49' },
  { label: '+1 US / Canada', value: '+1' },
  { label: '+41 Switzerland', value: '+41' },
  { label: '+43 Austria', value: '+43' },
  { label: '+351 Portugal', value: '+351' },
  { label: '+31 Netherlands', value: '+31' },
];

@Component({
  selector: 'app-academy-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputGroupModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    ToastModule,
    Tooltip,
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
  private readonly destroyRef = inject(DestroyRef);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly slug = signal<string>('');

  readonly provinceOptions = PROVINCE_OPTIONS;
  readonly countryOptions = COUNTRY_OPTIONS;
  readonly countryCodeOptions = COUNTRY_CODE_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255), noWhitespace]],
    phone_country_code: ['', [phonePairRequired('phone_national_number')]],
    phone_national_number: [
      '',
      [
        phonePairRequired('phone_country_code'),
        Validators.maxLength(20),
        Validators.pattern(/^[0-9]+$/),
      ],
    ],
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
    // Phone pair cross-revalidation (#161 → Copilot review on PR #188).
    // The validators are mutually dependent — when one control's value flips
    // between empty / non-empty, the OTHER control's validity needs a
    // re-check. Without this wiring, typing a country code wouldn't surface
    // the "national number required" error until the user touched that field.
    // `emitEvent: false` prevents the sibling's `valueChanges` from re-firing
    // this handler and looping. Same shape as the athlete form.
    const cc = this.form.controls.phone_country_code;
    const nn = this.form.controls.phone_national_number;
    cc.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      nn.updateValueAndValidity({ emitEvent: false });
    });
    nn.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      cc.updateValueAndValidity({ emitEvent: false });
    });

    const academy = this.academyService.academy();
    if (!academy) {
      void this.router.navigate(['/dashboard/academy']);
      return;
    }
    this.slug.set(academy.slug);
    this.form.patchValue({
      name: academy.name,
      phone_country_code: academy.phone_country_code ?? '',
      phone_national_number: academy.phone_national_number ?? '',
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

  get phoneCountryCode() {
    return this.form.controls.phone_country_code;
  }
  get phoneNationalNumber() {
    return this.form.controls.phone_national_number;
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

    // Phone (#161). Send `null` for both when either is empty (the validator
    // already rejects half-filled, so reaching here means both empty or both
    // valid). Sending null on both clears any existing saved phone.
    const phoneCc = v.phone_country_code.trim();
    const phoneNn = v.phone_national_number.trim();
    const phoneEmpty = phoneCc === '' || phoneNn === '';

    return {
      name: v.name.trim(),
      phone_country_code: phoneEmpty ? null : phoneCc,
      phone_national_number: phoneEmpty ? null : phoneNn,
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
