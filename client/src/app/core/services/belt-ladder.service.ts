import { Injectable, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AcademyService, Grade, MartialArt } from './academy.service';
import { Belt } from './athlete.service';
import { beltKey } from '../../shared/utils/i18n-enum-keys';

/**
 * The ceiling on `athletes.stripes` across every ladder (#1800) — the server's
 * `max:10`. Only what a belt outside the ladder is clamped to; a belt in it has
 * its own cap.
 */
export const STRIPES_CEILING = 10;

export interface BeltOption<T> {
  label: string;
  value: T;
}

/**
 * The academy's belt ladder, as the SPA reads it (#1801).
 *
 * The only place the client learns what belts exist, in what order, and how
 * many stripes each carries: `Academy.grades`, sent by the server from the
 * martial art's registry. There is deliberately no copy on the client — the
 * BJJ constants this replaced were a second answer that could disagree.
 *
 * Until an academy is loaded (the web-only athlete portal never loads one) the
 * ladder is empty and the art reads as BJJ, the column default: labels stay
 * right, and a belt with no grade is clamped only by the global ceiling.
 */
@Injectable({ providedIn: 'root' })
export class BeltLadderService {
  private readonly academyService = inject(AcademyService);
  private readonly translate = inject(TranslateService);

  readonly martialArt = computed<MartialArt>(
    () => this.academyService.academy()?.martial_art ?? 'bjj',
  );

  /** The ladder, lowest first. */
  readonly grades = computed<readonly Grade[]>(() => this.academyService.academy()?.grades ?? []);

  /** The belts this academy awards, in rank order. */
  readonly belts = computed<readonly Belt[]>(() => this.grades().map((grade) => grade.belt));

  /**
   * The belt an adult starts on: the lowest grade that is not a kids' step —
   * the rule `RankLadder::startingBelt()` applies on the server. White in all
   * four ladders today, and white until an academy is loaded.
   */
  readonly startingBelt = computed<Belt>(
    () => this.grades().find((grade) => !grade.kids)?.belt ?? 'white',
  );

  gradeOf(belt: Belt): Grade | undefined {
    return this.grades().find((grade) => grade.belt === belt);
  }

  /** How many stripes this belt may carry here. */
  stripeCap(belt: Belt): number {
    return this.gradeOf(belt)?.max_stripes ?? STRIPES_CEILING;
  }

  /** Whether the stripes on this belt are tapes on the belt (and not dan or poom). */
  countsStripes(belt: Belt): boolean {
    return (this.gradeOf(belt)?.count ?? 'stripe') === 'stripe';
  }

  labelKey(belt: Belt): string {
    return beltKey(belt, this.martialArt());
  }

  label(belt: Belt): string {
    return this.translate.instant(this.labelKey(belt));
  }

  /**
   * A stripe count the way its grade reads it: a plain number for stripes and
   * *tacche*, "3° dan" for a dan — the stored value plus the grade's `first`.
   */
  stripesLabel(belt: Belt, stripes: number): string {
    const grade = this.gradeOf(belt);
    if (grade === undefined || grade.count === 'stripe') return String(stripes);

    return this.translate.instant(grade.count === 'dan' ? 'belts.count.dan' : 'belts.count.poom', {
      n: grade.first + stripes,
    });
  }

  /** Every belt this academy awards, labelled, in rank order — for a picker or a filter. */
  beltOptions(): BeltOption<Belt>[] {
    return this.belts().map((belt) => ({ label: this.label(belt), value: belt }));
  }

  /** `0…cap` for this belt, labelled as its grade counts them. */
  stripeOptions(belt: Belt): BeltOption<string>[] {
    return Array.from({ length: this.stripeCap(belt) + 1 }, (_, stripes) => ({
      label: this.stripesLabel(belt, stripes),
      value: String(stripes),
    }));
  }
}
