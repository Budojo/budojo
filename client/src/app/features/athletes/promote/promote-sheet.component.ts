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
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { Athlete, AthleteService, Belt } from '../../../core/services/athlete.service';
import { BeltLadderService } from '../../../core/services/belt-ladder.service';
import { LanguageService } from '../../../core/services/language.service';
import { AthleteIdentityComponent } from '../../../shared/components/athlete-identity/athlete-identity.component';
import { holdDialogWhile } from '../../../shared/utils/dialog-hold';
import { Step, nextStep } from './next-step';

/**
 * A promotion from the athlete's row (#2045, PRD § 6.1): belt and stripes,
 * dated today.
 *
 * The next step on the academy's ladder is proposed, so the usual stripe is
 * one tap; the two pickers change it. It goes through the same update as the
 * PC's form, whose observer writes the promotion to the athlete's history
 * (`AthleteObserver`), so a phone promotion and a PC one are the same row.
 * Only a step up is recorded here: a correction is the history's job.
 */
@Component({
  selector: 'app-promote-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    SelectModule,
    AthleteIdentityComponent,
  ],
  templateUrl: './promote-sheet.component.html',
  styleUrl: './promote-sheet.component.scss',
})
export class PromoteSheetComponent {
  private readonly athletes = inject(AthleteService);
  private readonly beltLadder = inject(BeltLadderService);
  private readonly languageService = inject(LanguageService);

  /** Who is promoted; `null` keeps the sheet closed. */
  readonly athlete = input<Athlete | null>(null);

  readonly closed = output<void>();
  readonly promoted = output<Athlete>();
  /** The sheet is gone from the screen: the host can take the keyboard back. */
  readonly hidden = output<void>();

  protected readonly belt = signal<Belt | null>(null);
  protected readonly stripes = signal<number>(0);
  protected readonly saving = signal<boolean>(false);
  protected readonly failed = signal<boolean>(false);

  protected readonly beltOptions = computed(() => {
    this.languageService.currentLang();
    return this.beltLadder.beltOptions(this.athlete()?.belt ?? null);
  });

  protected readonly stripeOptions = computed(() => {
    this.languageService.currentLang();
    const belt = this.belt();
    return belt === null ? [] : this.beltLadder.stripeOptions(belt);
  });

  /** «Blue · 2»: a step the way the ladder names it. */
  protected stepLabel(step: Step): string {
    this.languageService.currentLang();
    return `${this.beltLadder.label(step.belt)} · ${this.beltLadder.stripesLabel(step.belt, step.stripes)}`;
  }

  protected readonly target = computed<Step | null>(() => {
    const belt = this.belt();
    return belt === null ? null : { belt, stripes: this.stripes() };
  });

  /** Only a step up: a higher belt, or more stripes on the same one. */
  protected readonly isUp = computed<boolean>(() => {
    const athlete = this.athlete();
    const target = this.target();
    if (athlete === null || target === null) return false;
    const from = this.beltLadder.rankOf(athlete.belt);
    const to = this.beltLadder.rankOf(target.belt);
    if (from === null || to === null) return false;
    return to > from || (to === from && target.stripes > athlete.stripes);
  });

  constructor() {
    effect(() => {
      const athlete = this.athlete();
      untracked(() => (athlete === null ? this.reset() : this.open(athlete)));
    });
    // Not dismissable while the promotion is on its way (#2133).
    holdDialogWhile(() => this.saving(), 'promote-dialog');
  }

  protected pickBelt(belt: Belt): void {
    this.belt.set(belt);
    // A belt with fewer stripes than were picked starts again from none.
    if (this.stripes() > this.beltLadder.stripeCap(belt)) this.stripes.set(0);
  }

  protected pickStripes(value: string): void {
    this.stripes.set(Number(value));
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible) this.closed.emit();
  }

  protected submit(): void {
    const athlete = this.athlete();
    const target = this.target();
    if (athlete === null || target === null || !this.isUp() || this.saving()) return;
    this.saving.set(true);
    this.failed.set(false);
    this.athletes.update(athlete.id, { belt: target.belt, stripes: target.stripes }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.promoted.emit(updated);
      },
      error: () => {
        this.saving.set(false);
        this.failed.set(true);
      },
    });
  }

  private open(athlete: Athlete): void {
    this.reset();
    const next = nextStep(this.beltLadder.grades(), athlete.belt, athlete.stripes);
    this.belt.set(next?.belt ?? athlete.belt);
    this.stripes.set(next?.stripes ?? athlete.stripes);
  }

  private reset(): void {
    this.belt.set(null);
    this.stripes.set(0);
    this.saving.set(false);
    this.failed.set(false);
  }
}
