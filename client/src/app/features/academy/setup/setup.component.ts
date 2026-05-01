import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { TranslatePipe } from '@ngx-translate/core';
import { AcademyService } from '../../../core/services/academy.service';
import { TrainingDaysPickerComponent } from '../../../shared/components/training-days-picker/training-days-picker.component';

const noWhitespace: ValidatorFn = (control: AbstractControl) =>
  control.value?.trim() ? null : { whitespace: true };

@Component({
  selector: 'app-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TrainingDaysPickerComponent,
    TranslatePipe,
  ],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss',
})
export class SetupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly academyService = inject(AcademyService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Setup intentionally does NOT collect the structured address (#72) —
   * six required fields (line1, line2, city, CAP, province, country) on
   * first contact would be a wall of friction at the worst moment.
   * Address belongs to the edit flow; users land on the dashboard, see
   * the empty Address row in the detail card, and add it on their own time.
   */
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255), noWhitespace]],
    // Optional. Empty array on submit → sent as null ("not configured").
    training_days: this.fb.nonNullable.control<number[]>([]),
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const name = this.form.value.name!.trim();
    const days = this.form.value.training_days ?? [];

    this.academyService
      .create({
        name,
        training_days: days.length === 0 ? null : days,
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err) => {
          this.error.set(err?.error?.message ?? 'Something went wrong. Please try again.');
        },
      });
  }

  setTrainingDays(days: number[]): void {
    this.form.controls.training_days.setValue(days);
  }

  get name() {
    return this.form.get('name')!;
  }
}
