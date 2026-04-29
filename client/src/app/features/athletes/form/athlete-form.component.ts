import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { Tooltip } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import {
  AthletePayload,
  AthleteService,
  AthleteStatus,
  Belt,
  MAX_STRIPES_PER_BELT,
} from '../../../core/services/athlete.service';
import { Address, CountryCode, ItalianProvinceCode } from '../../../core/services/academy.service';
import {
  COUNTRY_OPTIONS,
  PROVINCE_OPTIONS,
  addressAllOrNothing,
  italianPostalCode,
} from '../../../shared/utils/address-form';

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

/**
 * Validates that, when the field has a value, that value is a parseable
 * URL (http/https). Empty / whitespace-only values pass — the field is
 * optional. Mirrors the same validator on the academy form (#162) and
 * the backend's `nullable|url|max:255` rule. Tighter than Laravel's
 * default `url` (which accepts any scheme): we reject `mailto:`,
 * `javascript:`, etc. because the SPA renders these as social-link
 * chips that should only navigate to a real website.
 *
 * Duplicated rather than extracted to a shared util — second consumer
 * (Rule of Three: extract on the third). If a fourth form ever needs
 * URL fields, move this to `client/src/app/shared/utils/url-form.ts`.
 */
const urlIfPresent: ValidatorFn = (control: AbstractControl) => {
  const raw = (control.value ?? '').toString().trim();
  if (raw === '') return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: true };
    }
    return null;
  } catch {
    return { url: true };
  }
};

@Component({
  selector: 'app-athlete-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    ToastModule,
    Tooltip,
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

  // Order = IBJJF rank (kids → adults → senior coral/red) so the picker
  // reads bottom-up like a progression chart.
  readonly beltOptions: SelectOption<Belt>[] = [
    { label: 'Grey (kids)', value: 'grey' },
    { label: 'Yellow (kids)', value: 'yellow' },
    { label: 'Orange (kids)', value: 'orange' },
    { label: 'Green (kids)', value: 'green' },
    { label: 'White', value: 'white' },
    { label: 'Blue', value: 'blue' },
    { label: 'Purple', value: 'purple' },
    { label: 'Brown', value: 'brown' },
    { label: 'Black', value: 'black' },
    { label: 'Red & black (7°)', value: 'red-and-black' },
    { label: 'Red & white (8°)', value: 'red-and-white' },
    { label: 'Red (9°/10°)', value: 'red' },
  ];

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

  readonly provinceOptions = PROVINCE_OPTIONS;
  readonly countryOptions = COUNTRY_OPTIONS;

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
    // Contact links (#162) — same shape as the academy form. Each is
    // independently nullable; URL-or-empty validator rejects bare
    // handles + non-http(s) schemes before the network round-trip.
    website: ['', [Validators.maxLength(255), urlIfPresent]],
    facebook: ['', [Validators.maxLength(255), urlIfPresent]],
    instagram: ['', [Validators.maxLength(255), urlIfPresent]],
    // date_of_birth is the only field that can genuinely be null
    date_of_birth: this.fb.control<Date | null>(null),
    belt: this.fb.nonNullable.control<Belt>('white', Validators.required),
    stripes: this.fb.nonNullable.control<string>('0', Validators.required),
    status: this.fb.nonNullable.control<AthleteStatus>('active', Validators.required),
    joined_at: this.fb.nonNullable.control<Date>(new Date(), Validators.required),
    // Structured address (#72b) — same shape as the academy form.
    // The HTML fieldset is duplicated between the two forms; the validators,
    // option lists, and types are shared via `shared/utils/address-form`
    // so the rules can never drift.
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
  });

  /**
   * Mirror of the form's `belt` control as a signal. MUST be declared
   * AFTER the `form` field — class field initialisers run in order, and
   * `toSignal(this.form.controls.belt.valueChanges, ...)` reads the form
   * synchronously at construction time.
   */
  private readonly beltSignal = toSignal(this.form.controls.belt.valueChanges, {
    initialValue: this.form.controls.belt.value,
  });

  /**
   * Stripes options scoped to the SELECTED belt (#229). Black gets 0-6
   * because graus 1°-6° are stored as stripes; every other belt caps at
   * 0-4 (canonical IBJJF). Re-computes when `belt` changes — the
   * stripes-clamp wiring in ngOnInit also resets stripes back to a
   * valid value if the user downgrades from black with 5-6 stripes to
   * a belt that only allows 0-4.
   */
  readonly stripesOptions = computed<SelectOption<string>[]>(() => {
    const belt = this.beltSignal();
    const max = MAX_STRIPES_PER_BELT[belt];
    return Array.from({ length: max + 1 }, (_, i) => String(i)).map((v) => ({
      label: v,
      value: v,
    }));
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

    // Clamp stripes to the new belt's max when the belt changes (#229).
    // Without this, a black-belt athlete with stripes=5 downgraded to
    // brown would land in an invalid state (server rejects > 4 for
    // non-black) — silent until submit.
    this.form.controls.belt.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((belt) => {
        const max = MAX_STRIPES_PER_BELT[belt];
        const current = Number(this.form.controls.stripes.value);
        if (current > max) {
          this.form.controls.stripes.setValue(String(max));
        }
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
  // Contact links (#162) — each independently optional.
  get website() {
    return this.form.controls.website;
  }
  get facebook() {
    return this.form.controls.facebook;
  }
  get instagram() {
    return this.form.controls.instagram;
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
            website: athlete.website ?? '',
            facebook: athlete.facebook ?? '',
            instagram: athlete.instagram ?? '',
            date_of_birth: fromDateString(athlete.date_of_birth),
            belt: athlete.belt,
            stripes: String(athlete.stripes),
            status: athlete.status,
            ...(joinedAt ? { joined_at: joinedAt } : {}),
            address: {
              line1: athlete.address?.line1 ?? '',
              line2: athlete.address?.line2 ?? '',
              city: athlete.address?.city ?? '',
              postal_code: athlete.address?.postal_code ?? '',
              province: athlete.address?.province ?? '',
              country: athlete.address?.country ?? 'IT',
            },
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
    // Contact links (#162) — empty input → `null` on the wire (clears
    // the column). The validator already rejects malformed URLs, so
    // any non-empty value reaching here is a parseable http/https URL.
    const website = v.website?.trim() || null;
    const facebook = v.facebook?.trim() || null;
    const instagram = v.instagram?.trim() || null;

    return {
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      email: v.email?.trim() || null,
      phone_country_code: cc,
      phone_national_number: nn,
      website,
      facebook,
      instagram,
      date_of_birth: toDateString(v.date_of_birth),
      belt: v.belt,
      stripes: Number(v.stripes),
      status: v.status,
      joined_at: joinedAt,
      address: this.buildAddressPayload(v.address),
    };
  }

  /**
   * Translate the address sub-group into the wire shape (#72b). Mirrors the
   * academy form one-for-one: all-empty → null (clear the morph row),
   * all-filled → structured object. The all-or-nothing form validator
   * blocks half-filled groups before submit, so the cast on `province` is
   * safe at this point.
   */
  private buildAddressPayload(a: {
    line1: string;
    line2: string | null;
    city: string;
    postal_code: string;
    province: ItalianProvinceCode | '' | null;
    country: CountryCode;
  }): Address | null {
    const line1 = a.line1.trim();
    const city = a.city.trim();
    const postalCode = a.postal_code.trim();
    const province = a.province;

    const allEmpty =
      line1 === '' && city === '' && postalCode === '' && (province === '' || province == null);
    if (allEmpty) return null;

    const line2 = (a.line2 ?? '').trim();
    return {
      line1,
      line2: line2 === '' ? null : line2,
      city,
      postal_code: postalCode,
      province: province as ItalianProvinceCode,
      country: a.country,
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
