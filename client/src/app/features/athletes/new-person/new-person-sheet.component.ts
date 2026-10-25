import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import {
  Athlete,
  AthletePayload,
  AthleteService,
  Belt,
} from '../../../core/services/athlete.service';
import { BeltLadderService } from '../../../core/services/belt-ladder.service';
import { LanguageService } from '../../../core/services/language.service';
import { BudojoFormFieldComponent } from '../../../shared/components/budojo-form-field/budojo-form-field.component';
import { holdDialogWhile } from '../../../shared/utils/dialog-hold';

/**
 * Someone new at the door (#1939, #2045, PRD § 6.1): a person in three
 * fields, first name, last name and belt, while the class waits.
 *
 * The rest of the record waits for later: the toast after it links to the
 * full form. What was typed in the search comes in split into the two names.
 * A free trial is picked, because the trial class is who walks in: it trains
 * at no fee until the owner makes them a member from their record, so the
 * check-in never asks them for a month they were never charged.
 */
@Component({
  selector: 'app-new-person-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    BudojoFormFieldComponent,
  ],
  templateUrl: './new-person-sheet.component.html',
  styleUrl: './new-person-sheet.component.scss',
})
export class NewPersonSheetComponent {
  private readonly athletes = inject(AthleteService);
  private readonly beltLadder = inject(BeltLadderService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** What was typed in the search; `null` keeps the sheet closed. */
  readonly name = input<string | null>(null);

  readonly closed = output<void>();
  readonly created = output<Athlete>();
  /** The sheet is gone from the screen: the host can take the keyboard back. */
  readonly hidden = output<void>();

  protected readonly form = this.fb.group({
    first_name: ['', [Validators.required, Validators.maxLength(100)]],
    last_name: ['', [Validators.required, Validators.maxLength(100)]],
    belt: this.fb.control<Belt>(this.beltLadder.startingBelt(), Validators.required),
    trial: [true],
  });

  protected readonly saving = signal<boolean>(false);
  protected readonly failed = signal<boolean>(false);
  /** Set once Add was pressed: required errors show from then on. */
  protected readonly tried = signal<boolean>(false);

  protected readonly beltOptions = computed(() => {
    this.languageService.currentLang();
    return this.beltLadder.beltOptions();
  });

  protected readonly kindOptions = computed(() => {
    this.languageService.currentLang();
    return [
      { label: this.translate.instant('athletes.newPerson.trial'), value: true },
      { label: this.translate.instant('athletes.newPerson.member'), value: false },
    ];
  });

  constructor() {
    effect(() => {
      const name = this.name();
      untracked(() => (name === null ? this.reset() : this.open(name)));
    });
    // Not dismissable while the record is on its way (#2133).
    holdDialogWhile(() => this.saving(), 'new-person-dialog');
  }

  /** One name field's error, once Add was pressed: missing, or too long. */
  protected errorOf(field: 'first_name' | 'last_name'): string | null {
    const control = this.form.controls[field];
    if (!this.tried()) return null;
    if (control.hasError('required')) {
      return this.translate.instant(
        field === 'first_name'
          ? 'athletes.form.validation.firstName.required'
          : 'athletes.form.validation.lastName.required',
      );
    }
    if (control.hasError('maxlength')) {
      return this.translate.instant('athletes.form.validation.maxLength100');
    }
    return null;
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible) this.closed.emit();
  }

  protected submit(): void {
    this.tried.set(true);
    if (this.form.invalid || this.saving()) return;
    const { first_name, last_name, belt, trial } = this.form.getRawValue();
    const payload: AthletePayload = {
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      belt,
      stripes: 0,
      status: 'active',
      joined_at: today(),
      ...(trial ? { fee_override_cents: 0 } : {}),
    };
    this.saving.set(true);
    this.failed.set(false);
    this.athletes.create(payload).subscribe({
      next: (athlete) => {
        this.saving.set(false);
        this.created.emit(athlete);
      },
      error: () => {
        this.saving.set(false);
        this.failed.set(true);
      },
    });
  }

  private open(typed: string): void {
    this.reset();
    const [first = '', ...rest] = typed.trim().split(/\s+/).filter(Boolean);
    this.form.patchValue({ first_name: first, last_name: rest.join(' ') });
  }

  private reset(): void {
    this.form.reset({
      first_name: '',
      last_name: '',
      belt: this.beltLadder.startingBelt(),
      trial: true,
    });
    this.saving.set(false);
    this.failed.set(false);
    this.tried.set(false);
  }
}

/** Today as the API takes it, from the local clock: `2026-10-06`. */
function today(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
