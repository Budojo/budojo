import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  runInInjectionContext,
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

/** A belt and its stripes: where a promotion lands. */
interface Step {
  readonly belt: Belt;
  readonly stripes: number;
}

/**
 * A promotion from the athlete's row (#2045, PRD § 6.1): belt and stripes,
 * dated today.
 *
 * The next step on the academy's ladder is proposed, asked of the server so
 * it is the one «Chi promuovere?» names (`GET /athletes/{id}/next-step`): the
 * usual stripe is one tap, and the two pickers change it. It goes through the
 * same update as the PC's form, whose observer writes the promotion to the
 * athlete's history (`AthleteObserver`), so a phone promotion and a PC one
 * are the same row.
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
  /** What the server proposed: kept on the belt list whatever is picked after. */
  private readonly proposed = signal<Belt | null>(null);
  protected readonly stripes = signal<number>(0);
  /** The proposal is on its way: the pickers show where the athlete is. */
  protected readonly loading = signal<boolean>(false);
  protected readonly saving = signal<boolean>(false);
  protected readonly failed = signal<boolean>(false);

  /**
   * The ladder's belts, with the one held and the one proposed always on it:
   * an academy without kids' classes hides those grades, but a child already
   * on one is proposed the next (#2143 review).
   */
  protected readonly beltOptions = computed(() => {
    this.languageService.currentLang();
    const options = this.beltLadder.beltOptions(this.athlete()?.belt ?? null);
    const extra = [this.proposed(), this.belt()].filter(
      (belt): belt is Belt => belt !== null && !options.some((option) => option.value === belt),
    );
    if (extra.length === 0) return options;
    return this.beltLadder
      .allBeltOptions()
      .filter(
        (option) =>
          extra.includes(option.value) || options.some((kept) => kept.value === option.value),
      );
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

  /** Something to record: a step other than the one they hold. */
  protected readonly changed = computed<boolean>(() => {
    const athlete = this.athlete();
    const target = this.target();
    return (
      athlete !== null &&
      target !== null &&
      (target.belt !== athlete.belt || target.stripes !== athlete.stripes)
    );
  });

  /** Which opening an answer belongs to: a late one for a closed sheet is dropped. */
  private opening = 0;
  /** A pick by hand: a proposal that answers after it does not overwrite it. */
  private picked = false;
  /** Where `settleFocus` put the keyboard: moved again only if it is still there. */
  private settled: Element | null = null;
  private readonly injector = inject(Injector);

  constructor() {
    effect(() => {
      const athlete = this.athlete();
      untracked(() => (athlete === null ? this.reset() : this.open(athlete)));
    });
    // Not dismissable while the promotion is on its way (#2133).
    holdDialogWhile(() => this.saving(), 'promote-dialog');
  }

  /**
   * A new belt starts with no stripes, as it does on the mat. Back on the
   * belt they hold, the next stripe on it: going there and back is not a
   * reason to take their stripes away (#2143 review).
   */
  protected pickBelt(belt: Belt): void {
    this.picked = true;
    this.belt.set(belt);
    const athlete = this.athlete();
    if (athlete !== null && belt === athlete.belt) {
      this.stripes.set(Math.min(athlete.stripes + 1, this.beltLadder.stripeCap(belt)));
    } else {
      this.stripes.set(0);
    }
  }

  protected pickStripes(value: string): void {
    this.picked = true;
    this.stripes.set(Number(value));
  }

  /**
   * The keyboard starts on Record, the one thing the sheet is for: the
   * dialog's own pick is the ✕, where Enter would close it (#2143 review).
   */
  protected settleFocus(): void {
    const sheet = document.querySelector('.promote-dialog');
    const record = sheet?.querySelector<HTMLButtonElement>('[data-cy="promote-submit"] button');
    const target =
      record && !record.disabled ? record : sheet?.querySelector<HTMLElement>('#promote-belt');
    target?.focus();
    this.settled = target ?? null;
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible) this.closed.emit();
  }

  protected submit(): void {
    const athlete = this.athlete();
    const target = this.target();
    if (athlete === null || target === null || !this.changed() || this.saving()) return;
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
    this.belt.set(athlete.belt);
    this.stripes.set(athlete.stripes);
    this.loading.set(true);
    const opening = this.opening;
    // A failure proposes nothing: the pickers still record a step by hand.
    this.athletes.nextStep(athlete.id).subscribe({
      next: (next) => {
        if (opening !== this.opening) return;
        this.proposed.set(next?.belt ?? null);
        if (next !== null && !this.picked) {
          this.belt.set(next.belt);
          this.stripes.set(next.stripes);
        }
        this.loading.set(false);
        // Record is on now: the keyboard moves to it, unless someone moved it.
        runInInjectionContext(this.injector, () =>
          afterNextRender(() => {
            if (this.settled !== null && document.activeElement === this.settled) {
              this.settleFocus();
            }
          }),
        );
      },
      error: () => {
        if (opening === this.opening) this.loading.set(false);
      },
    });
  }

  private reset(): void {
    this.opening++;
    this.picked = false;
    this.proposed.set(null);
    this.settled = null;
    this.loading.set(false);
    this.belt.set(null);
    this.stripes.set(0);
    this.saving.set(false);
    this.failed.set(false);
  }
}
