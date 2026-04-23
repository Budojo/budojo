import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
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

/** Parse a YYYY-MM-DD string as a local-midnight Date (no TZ shift). */
function fromDateString(s: string | null | undefined): Date | null {
  return s ? new Date(`${s}T00:00:00`) : null;
}

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

  readonly form = this.fb.nonNullable.group({
    first_name: ['', [Validators.required, Validators.maxLength(100)]],
    last_name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    phone: ['', Validators.maxLength(30)],
    // date_of_birth is the only field that can genuinely be null
    date_of_birth: this.fb.control<Date | null>(null),
    belt: this.fb.nonNullable.control<Belt>('white', Validators.required),
    stripes: this.fb.nonNullable.control<string>('0', Validators.required),
    status: this.fb.nonNullable.control<AthleteStatus>('active', Validators.required),
    joined_at: this.fb.nonNullable.control<Date>(new Date(), Validators.required),
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.athleteId.set(id);
      this.loadAthlete(id);
    }
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
  get phone() {
    return this.form.controls.phone;
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
            phone: athlete.phone ?? '',
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

    return {
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      email: v.email?.trim() || null,
      phone: v.phone?.trim() || null,
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
