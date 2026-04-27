import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
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
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {
  AthletePayload,
  AthleteService,
  AthleteStatus,
  Belt,
} from '../../../core/services/athlete.service';

interface SelectOption<T extends string> {
  label: string;
  value: T;
}

/**
 * Convert a Date object to a local-timezone YYYY-MM-DD string.
 * Using toISOString() would shift the date by up to ±1 day depending on the
 * user's timezone — we want the calendar date the user actually picked.
 */
function toDateString(d: Date | null | undefined): string | null {
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string as a local-midnight Date.
 * We construct the Date from numeric parts rather than parsing a string — string
 * parsing of ISO-like strings without a TZ suffix is inconsistent across browsers
 * (notably older Safari), while `new Date(y, mIndex, d)` always yields local midnight.
 */
function fromDateString(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [year, month, day] = s.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

/**
 * Cross-field rule for the (#75) phone pair: when the SIBLING control has a
 * value, this control becomes required. Both fields independently optional, but
 * inseparable once one is filled — the backend enforces the same `required_with`
 * relation so we keep the UX in lockstep with the API contract.
 *
 * The validator reads the sibling lazily through `control.parent` rather than
 * capturing a control reference at construction time — at the moment the
 * validator is created the parent FormGroup doesn't exist yet, and capturing
 * the sibling later would couple us to FormBuilder ordering.
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

@Component({
  selector: 'app-athlete-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputGroupModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './athlete-form.component.html',
  styleUrl: './athlete-form.component.scss',
})
export class AthleteFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly athleteService = inject(AthleteService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly today = new Date();
  private readonly athleteId = signal<number | null>(null);

  readonly mode = computed<'create' | 'edit'>(() =>
    this.athleteId() === null ? 'create' : 'edit',
  );

  readonly beltOptions: SelectOption<Belt>[] = [
    { label: 'White', value: 'white' },
    { label: 'Blue', value: 'blue' },
    { label: 'Purple', value: 'purple' },
    { label: 'Brown', value: 'brown' },
    { label: 'Black', value: 'black' },
  ];

  readonly stripesOptions: SelectOption<string>[] = ['0', '1', '2', '3', '4'].map((v) => ({
    label: v,
    value: v,
  }));

  readonly statusOptions: SelectOption<AthleteStatus>[] = [
    { label: 'Active', value: 'active' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Inactive', value: 'inactive' },
  ];

  /**
   * Curated country code list (#75). Italy-first because that's the primary
   * market; the rest covers the typical European + transatlantic mix we see
   * in BJJ academies. The `value` is the E.164 prefix that goes on the wire,
   * the `label` is what the user picks from the dropdown.
   *
   * If we ever need a code that isn't in this list we expand it here — the
   * backend regex (`^\+[1-9][0-9]{0,3}$`) accepts any well-formed prefix,
   * so the constraint is purely UX, not API.
   */
  readonly countryCodeOptions: SelectOption<string>[] = [
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

  readonly form = this.fb.nonNullable.group({
    first_name: ['', [Validators.required, Validators.maxLength(100)]],
    last_name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    phone_country_code: ['', [phonePairRequired('phone_national_number')]],
    phone_national_number: [
      '',
      [
        phonePairRequired('phone_country_code'),
        Validators.maxLength(20),
        Validators.pattern(/^[0-9]+$/),
      ],
    ],
    // date_of_birth is the only field that can genuinely be null
    date_of_birth: this.fb.control<Date | null>(null),
    belt: this.fb.nonNullable.control<Belt>('white', Validators.required),
    stripes: this.fb.nonNullable.control<string>('0', Validators.required),
    status: this.fb.nonNullable.control<AthleteStatus>('active', Validators.required),
    joined_at: this.fb.nonNullable.control<Date>(new Date(), Validators.required),
  });

  ngOnInit(): void {
    // The phone pair validators are mutually dependent — when one control's
    // value flips between empty/non-empty, the OTHER control's validity needs
    // a re-check. Without this wiring, typing a country code wouldn't surface
    // the "national number required" error until the user touched that field.
    //
    // We let the recompute bubble UP to the parent FormGroup (the default —
    // do NOT pass `onlySelf: true`) so `form.invalid` re-aggregates correctly
    // and `submit()` blocks while the pair is half-filled. `emitEvent: false`
    // is the only suppression: it prevents the sibling's `valueChanges` from
    // firing and re-entering this handler, which would loop.
    const cc = this.form.controls.phone_country_code;
    const nn = this.form.controls.phone_national_number;
    cc.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      nn.updateValueAndValidity({ emitEvent: false });
    });
    nn.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      cc.updateValueAndValidity({ emitEvent: false });
    });

    // Subscribe to paramMap rather than reading snapshot so the form reloads if
    // Angular reuses the component instance when the `:id` changes.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const idParam = paramMap.get('id');
      if (!idParam) {
        this.athleteId.set(null);
        return;
      }
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        this.messageService.add({
          severity: 'error',
          summary: 'Invalid athlete',
          detail: 'The requested athlete id is invalid.',
          life: 3000,
        });
        void this.router.navigate(['/dashboard/athletes']);
        return;
      }
      this.athleteId.set(id);
      this.loadAthlete(id);
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.buildPayload();
    if (!payload) return;

    this.submitting.set(true);
    this.error.set(null);

    const id = this.athleteId();
    const obs =
      id === null ? this.athleteService.create(payload) : this.athleteService.update(id, payload);

    obs.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (athlete) => {
        this.messageService.add({
          severity: 'success',
          summary: id === null ? 'Athlete created' : 'Athlete updated',
          detail: `${athlete.first_name} ${athlete.last_name}`,
          life: 3000,
        });
        void this.router.navigate(['/dashboard/athletes']);
      },
      error: (err) => this.handleServerError(err),
    });
  }

  cancel(): void {
    void this.router.navigate(['/dashboard/athletes']);
  }

  get firstName() {
    return this.form.controls.first_name;
  }
  get lastName() {
    return this.form.controls.last_name;
  }
  get email() {
    return this.form.controls.email;
  }
  get phoneCountryCode() {
    return this.form.controls.phone_country_code;
  }
  get phoneNationalNumber() {
    return this.form.controls.phone_national_number;
  }
  get dateOfBirth() {
    return this.form.controls.date_of_birth;
  }
  get belt() {
    return this.form.controls.belt;
  }
  get stripes() {
    return this.form.controls.stripes;
  }
  get status() {
    return this.form.controls.status;
  }
  get joinedAt() {
    return this.form.controls.joined_at;
  }

  private loadAthlete(id: number): void {
    this.loading.set(true);
    this.error.set(null);

    this.athleteService
      .get(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (athlete) => {
          const joinedAt = fromDateString(athlete.joined_at);
          this.form.patchValue({
            first_name: athlete.first_name,
            last_name: athlete.last_name,
            email: athlete.email ?? '',
            phone_country_code: athlete.phone_country_code ?? '',
            phone_national_number: athlete.phone_national_number ?? '',
            date_of_birth: fromDateString(athlete.date_of_birth),
            belt: athlete.belt,
            stripes: String(athlete.stripes),
            status: athlete.status,
            ...(joinedAt ? { joined_at: joinedAt } : {}),
          });
        },
        error: () => {
          this.error.set('Could not load this athlete. Please try again.');
        },
      });
  }

  private buildPayload(): AthletePayload | null {
    const v = this.form.getRawValue();
    const joinedAt = toDateString(v.joined_at);
    if (!joinedAt) return null;

    const cc = v.phone_country_code?.trim() || null;
    const nn = v.phone_national_number?.trim() || null;

    return {
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      email: v.email?.trim() || null,
      phone_country_code: cc,
      phone_national_number: nn,
      date_of_birth: toDateString(v.date_of_birth),
      belt: v.belt,
      stripes: Number(v.stripes),
      status: v.status,
      joined_at: joinedAt,
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
    this.error.set(err.error?.message ?? 'Something went wrong. Please try again.');
  }
}
