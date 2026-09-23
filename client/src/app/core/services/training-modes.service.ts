import { Injectable, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AcademyService, MartialArt, TrainingMode } from './academy.service';
import { LanguageService } from './language.service';
import {
  TRAINING_MODE_BOTH_KEYS,
  TRAINING_MODE_HINT_KEYS,
  TRAINING_MODE_KEYS,
} from '../../shared/utils/i18n-enum-keys';

export interface TrainingModeOption {
  readonly value: TrainingMode;
  readonly label: string;
}

/**
 * The academy's training modes, as the SPA reads them (#1803).
 *
 * The one place a screen learns which split its academy draws — gi and no-gi,
 * kata and kumite — and what each side is called. `Academy.training_modes`
 * comes from the server's registry, so the client keeps no list of its own
 * that could disagree with it.
 *
 * Until an academy is loaded the art reads as BJJ, the column default, which
 * is what every screen showed before this existed.
 */
@Injectable({ providedIn: 'root' })
export class TrainingModesService {
  private readonly academyService = inject(AcademyService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  private readonly martialArt = computed<MartialArt>(
    () => this.academyService.academy()?.martial_art ?? 'bjj',
  );

  /** The art's two modes, in picker order: `['gi', 'nogi']`, `['kata', 'kumite']`. */
  readonly modes = computed<readonly TrainingMode[]>(
    () => this.academyService.academy()?.training_modes ?? ['gi', 'nogi'],
  );

  /** A class: the two modes, then the middle, then what is not the art at all. */
  readonly classModes = computed<readonly TrainingMode[]>(() => [...this.modes(), 'both', 'other']);

  /**
   * A topic: the two modes, then the middle, the same order as a class — so
   * the middle, the odd one out, takes the grid's last row. Never `other`.
   */
  readonly topicModes = computed<readonly TrainingMode[]>(() => [...this.modes(), 'both']);

  /**
   * What a new class starts as. Gi in BJJ, as it always has; the middle
   * everywhere else, because a judo or karate class is mixed until the owner
   * says otherwise (the PRD's call, not a rule of the arts).
   */
  readonly newClassMode = computed<TrainingMode>(() =>
    this.martialArt() === 'bjj' ? this.modes()[0] : 'both',
  );

  /** Every mode's label in the active language. `both` reads as the art says it. */
  readonly labels = computed<Readonly<Record<TrainingMode, string>>>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const t = (key: string): string => this.translate.instant(key);
    return {
      gi: t(TRAINING_MODE_KEYS.gi),
      nogi: t(TRAINING_MODE_KEYS.nogi),
      'tachi-waza': t(TRAINING_MODE_KEYS['tachi-waza']),
      'ne-waza': t(TRAINING_MODE_KEYS['ne-waza']),
      kata: t(TRAINING_MODE_KEYS.kata),
      kumite: t(TRAINING_MODE_KEYS.kumite),
      poomsae: t(TRAINING_MODE_KEYS.poomsae),
      kyorugi: t(TRAINING_MODE_KEYS.kyorugi),
      other: t(TRAINING_MODE_KEYS.other),
      both: t(TRAINING_MODE_BOTH_KEYS[this.martialArt()]),
    };
  });

  readonly classOptions = computed<TrainingModeOption[]>(() =>
    this.classModes().map((value) => ({ value, label: this.labels()[value] })),
  );

  readonly topicOptions = computed<TrainingModeOption[]>(() =>
    this.topicModes().map((value) => ({ value, label: this.labels()[value] })),
  );

  /** The programme form's example of the split: heel hooks, ō-soto-gari, saifa. */
  readonly hintKey = computed<string>(() => TRAINING_MODE_HINT_KEYS[this.martialArt()]);
}
