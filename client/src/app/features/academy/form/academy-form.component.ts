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
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { Tooltip } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AcademyService,
  Address,
  CountryCode,
  ItalianProvinceCode,
  UpdateAcademyPayload,
} from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import { localeFor } from '../../../shared/utils/locale';
import { TrainingDaysPickerComponent } from '../../../shared/components/training-days-picker/training-days-picker.component';
import { SchedulePlannerComponent } from '../schedule-planner/schedule-planner.component';
import { FeeTierListComponent } from '../fee-tier-list/fee-tier-list.component';
import { BudojoFormFieldComponent } from '../../../shared/components/budojo-form-field/budojo-form-field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
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

/**
 * Validates that, when the field has a value, that value is a parseable
 * URL (http/https). Empty / whitespace-only values pass — the field is
 * optional, so the validator's job is only to catch malformed input.
 * Mirrors the backend's `nullable|url|max:255` rule for the contact-link
 * fields (#162). Uses native `URL` parsing rather than a regex because
 * Laravel's `url` rule defers to PHP's URL parser, and the two stay
 * closely aligned in what they accept.
 */
const urlIfPresent: ValidatorFn = (control: AbstractControl) => {
  const raw = (control.value ?? '').toString().trim();
  if (raw === '') return null;
  try {
    const parsed = new URL(raw);
    // Accept only http/https — `mailto:`, `tel:`, `javascript:` etc.
    // would render as a clickable link on the detail page that does
    // the wrong thing. Tighter than Laravel's default but appropriate
    // for "social profile / website" semantics.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: true };
    }
    return null;
  } catch {
    return { url: true };
  }
};

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
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    ToastModule,
    Tooltip,
    TranslatePipe,
    TrainingDaysPickerComponent,
    SchedulePlannerComponent,
    FeeTierListComponent,
    BudojoFormFieldComponent,
    PageHeaderComponent,
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
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly slug = signal<string>('');

  /**
   * BCP-47 locale tag derived from the active SPA language. Bound to
   * `<p-inputnumber [locale]>` so the EUR currency formatting flips
   * separators when the user toggles language ("€ 50.00" in EN,
   * "€ 50,00" in IT). Computed against the language signal so it
   * recomputes reactively without a manual subscription.
   */
  readonly currentLocale = computed(() => localeFor(this.languageService.currentLang()));

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
    // Contact links (#162) — three independently nullable URLs.
    // Laravel's `url` rule accepts any scheme it can parse (ftp:,
    // mailto:, …), so the SPA's `urlIfPresent` is deliberately
    // tighter: http/https only. We don't want a `mailto:` slipping
    // through and rendering as a broken external link on the detail
    // page.
    website: ['', [Validators.maxLength(255), urlIfPresent]],
    facebook: ['', [Validators.maxLength(255), urlIfPresent]],
    instagram: ['', [Validators.maxLength(255), urlIfPresent]],
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
    // Monthly fee (#267) — euros at the form layer, persisted as cents on
    // the wire. `null` means "no fee set" and turns off the v1.7.0
    // payments features (athletes-list inline toggle, per-athlete tab).
    // Server validator: `sometimes|nullable|integer|min:0` on
    // `monthly_fee_cents`.
    monthly_fee: this.fb.control<number | null>(null, [Validators.min(0)]),
    // Entry carnets (#1364). Both optional and independently nullable; the
    // server treats either being null as "this academy doesn't sell carnets".
    carnet_price: this.fb.control<number | null>(null, [Validators.min(0)]),
    carnet_entries: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(255)]),
    training_days: this.fb.nonNullable.control<number[]>([]),
    // The month the training year restarts in (#1484), 1-12. `null` is not
    // "no season" — it is "nobody has said", which the server answers with
    // September.
    season_start_month: this.fb.control<number | null>(null),
  });

  /**
   * The twelve months, named by the current language (#1484).
   *
   * Built from `Intl` rather than twelve translation keys: the browser
   * already knows every month in every locale we ship, and a hand-maintained
   * list would be twelve more strings to keep in lock-step for no new
   * information. A `computed` on the language signal so the labels follow the
   * sidebar toggle without a reload.
   */
  protected readonly seasonMonthOptions = computed<{ label: string; value: number }[]>(() => {
    const format = new Intl.DateTimeFormat(localeFor(this.languageService.currentLang()), {
      month: 'long',
    });
    return Array.from({ length: 12 }, (_, i) => ({
      // Day 1 of each month of an arbitrary non-leap year — only the month
      // name is read off it.
      label: format.format(new Date(2025, i, 1)),
      value: i + 1,
    }));
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
      website: academy.website ?? '',
      facebook: academy.facebook ?? '',
      instagram: academy.instagram ?? '',
      address: {
        line1: academy.address?.line1 ?? '',
        line2: academy.address?.line2 ?? '',
        city: academy.address?.city ?? '',
        postal_code: academy.address?.postal_code ?? '',
        province: academy.address?.province ?? '',
        country: academy.address?.country ?? 'IT',
      },
      // Cents → euros at the form boundary. `null` round-trips so an
      // unset fee stays unset.
      monthly_fee: academy.monthly_fee_cents == null ? null : academy.monthly_fee_cents / 100,
      carnet_price: academy.carnet_price_cents == null ? null : academy.carnet_price_cents / 100,
      carnet_entries: academy.carnet_entries ?? null,
      training_days: academy.training_days ?? [],
      season_start_month: academy.season_start_month ?? null,
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
            summary: this.translate.instant('academy.form.toast.successSummary'),
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

  // ── Inline error keys for the BudojoFormField wrapper (#1052) ──────
  // toSignal(control.events) so markAllAsTouched() on submit re-renders
  // the inline error — the canonical pattern from #1045/#1049/#1050.
  private readonly nameEvents = toSignal(this.form.controls.name.events, { initialValue: null });
  private readonly phoneCountryEvents = toSignal(this.form.controls.phone_country_code.events, {
    initialValue: null,
  });
  private readonly phoneNumberEvents = toSignal(this.form.controls.phone_national_number.events, {
    initialValue: null,
  });
  private readonly websiteEvents = toSignal(this.form.controls.website.events, {
    initialValue: null,
  });
  private readonly facebookEvents = toSignal(this.form.controls.facebook.events, {
    initialValue: null,
  });
  private readonly instagramEvents = toSignal(this.form.controls.instagram.events, {
    initialValue: null,
  });
  private readonly monthlyFeeEvents = toSignal(this.form.controls.monthly_fee.events, {
    initialValue: null,
  });
  private readonly carnetPriceEvents = toSignal(this.form.controls.carnet_price.events, {
    initialValue: null,
  });
  private readonly carnetEntriesEvents = toSignal(this.form.controls.carnet_entries.events, {
    initialValue: null,
  });

  readonly nameError = computed<string | null>(() => {
    void this.nameEvents();
    const c = this.form.controls.name;
    if (!c.touched || c.valid) return null;
    if (c.errors?.['required'] || c.errors?.['whitespace'])
      return 'academy.form.name.errorRequired';
    if (c.errors?.['maxlength']) return 'academy.form.name.errorMaxlength';
    return null;
  });
  readonly phoneError = computed<string | null>(() => {
    void this.phoneCountryEvents();
    void this.phoneNumberEvents();
    const cc = this.form.controls.phone_country_code;
    const num = this.form.controls.phone_national_number;
    if (cc.touched && cc.errors?.['phonePairRequired']) {
      return 'academy.form.phone.errorCodeRequired';
    }
    if (num.touched) {
      if (num.errors?.['phonePairRequired']) return 'academy.form.phone.errorNationalRequired';
      if (num.errors?.['pattern']) return 'academy.form.phone.errorPattern';
      if (num.errors?.['maxlength']) return 'academy.form.phone.errorMaxlength';
    }
    return null;
  });
  readonly websiteError = computed<string | null>(() => {
    void this.websiteEvents();
    const c = this.form.controls.website;
    if (!c.touched || c.valid) return null;
    if (c.errors?.['url']) return 'academy.form.website.errorUrl';
    return 'academy.form.url.errorMaxlength';
  });
  readonly facebookError = computed<string | null>(() => {
    void this.facebookEvents();
    const c = this.form.controls.facebook;
    if (!c.touched || c.valid) return null;
    if (c.errors?.['url']) return 'academy.form.facebook.errorUrl';
    return 'academy.form.url.errorMaxlength';
  });
  readonly instagramError = computed<string | null>(() => {
    void this.instagramEvents();
    const c = this.form.controls.instagram;
    if (!c.touched || c.valid) return null;
    if (c.errors?.['url']) return 'academy.form.instagram.errorUrl';
    return 'academy.form.url.errorMaxlength';
  });
  readonly monthlyFeeError = computed<string | null>(() => {
    void this.monthlyFeeEvents();
    const c = this.form.controls.monthly_fee;
    if (!c.touched || c.valid) return null;
    if (c.errors?.['min']) return 'academy.form.monthlyFee.errorMin';
    return null;
  });
  readonly carnetPriceError = computed<string | null>(() => {
    void this.carnetPriceEvents();
    const c = this.form.controls.carnet_price;
    if (!c.touched || c.valid) return null;
    if (c.errors?.['min']) return 'academy.form.carnetPrice.errorMin';
    return null;
  });
  readonly carnetEntriesError = computed<string | null>(() => {
    void this.carnetEntriesEvents();
    const c = this.form.controls.carnet_entries;
    if (!c.touched || c.valid) return null;
    if (c.errors?.['min'] || c.errors?.['max']) return 'academy.form.carnetEntries.errorRange';
    return null;
  });

  get name() {
    return this.form.controls.name;
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

  get addressGroup() {
    return this.form.controls.address;
  }

  get monthlyFee() {
    return this.form.controls.monthly_fee;
  }

  get carnetPrice() {
    return this.form.controls.carnet_price;
  }

  get carnetEntries() {
    return this.form.controls.carnet_entries;
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

    // Contact links (#162). Each is independently nullable — empty
    // string clears the field on the wire (`null` semantics), a
    // populated string is sent as-is. The validator already rejects
    // malformed URLs, so reaching here means each value is either
    // empty or a parseable http/https URL.
    const website = v.website.trim();
    const facebook = v.facebook.trim();
    const instagram = v.instagram.trim();

    // Monthly fee (#267) — euros → cents at the wire boundary. `null`
    // (cleared input) clears the server-side fee and turns the payments
    // features off. `Math.round` keeps us safe against float artefacts —
    // the server validator requires an integer.
    const monthlyFeeEur = v.monthly_fee;
    const monthlyFeeCents = monthlyFeeEur == null ? null : Math.round(monthlyFeeEur * 100);

    return {
      name: v.name.trim(),
      phone_country_code: phoneEmpty ? null : phoneCc,
      phone_national_number: phoneEmpty ? null : phoneNn,
      website: website === '' ? null : website,
      facebook: facebook === '' ? null : facebook,
      instagram: instagram === '' ? null : instagram,
      address,
      monthly_fee_cents: monthlyFeeCents,
      // Same euros → cents boundary as the fee. Clearing either half turns
      // the carnet offering off server-side.
      carnet_price_cents: v.carnet_price == null ? null : Math.round(v.carnet_price * 100),
      carnet_entries: v.carnet_entries ?? null,
      training_days: v.training_days.length === 0 ? null : v.training_days,
      season_start_month: v.season_start_month ?? null,
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
      this.error.set(
        firstError ?? err.error.message ?? this.translate.instant('academy.form.errorValidation'),
      );
      return;
    }
    if (err.status === 403) {
      void this.router.navigate(['/dashboard']);
      return;
    }
    this.error.set(err.error?.message ?? this.translate.instant('academy.form.errorGeneric'));
  }
}
