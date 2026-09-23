import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';
import { Belt } from '../../../core/services/athlete.service';
import { BeltLadderService } from '../../../core/services/belt-ladder.service';
import { LanguageService } from '../../../core/services/language.service';
import { beltColourVar, beltInkVar, beltPaint } from '../../utils/belt-palette';

/**
 * Renders a belt as a coloured pill, optionally with stripe markers inline.
 * The colours are *domain* values, defined once in `budojo-theme.scss`
 * (`--budojo-belt-<colour>` and its `-ink`) — the canon's "unless the token
 * truly doesn't exist" exception: a blue belt is #1d4ed8, not the primary.
 *
 * What a belt is called, how many stripes it can carry and what they count
 * all come from the academy's ladder (#1801, `BeltLadderService`) — there is
 * no belt table here. A stripe on a BJJ belt or a karate *tacca* draws as a
 * tile; a dan or a poom is written ("3° dan"), because none of our
 * federations marks it on the belt and tiles would misreport it.
 *
 * Two **appearances** of the same fact (#1429):
 *
 * - `badge` — the pill, with the belt's name written on it. A two-colour belt
 *   is its main colour with the second as a **band at the end**: the text sits
 *   on one colour only, which is the only way every pair clears WCAG AA —
 *   no single ink reads on both halves of yellow-and-orange (#1801).
 * - `spine` — a vertical bar for the left edge of a roster row, with no text,
 *   so it can show both halves in full.
 *
 * One component rather than two, because the hard part is not the shape: it
 * is the palette and the stripe cap, and having those in two places is how a
 * promotion ends up rendering differently in two corners of the same screen.
 */
@Component({
  selector: 'app-belt-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule, TranslatePipe],
  templateUrl: './belt-badge.component.html',
  styleUrl: './belt-badge.component.scss',
  host: {
    '[class.belt-badge--two-tone]': 'paint().tip !== null',
  },
})
export class BeltBadgeComponent {
  private readonly ladder = inject(BeltLadderService);
  private readonly languageService = inject(LanguageService);

  readonly belt = input.required<Belt>();
  /**
   * The stored stripe count, 0…cap. What it means is the grade's call: tiles
   * for stripes and *tacche*, a written "n° dan" for a dan or a poom. Clamped
   * to the grade's cap so a stale value outside it cannot blow the layout.
   */
  readonly stripes = input<number>(0);

  /**
   * `badge` writes the belt's name; `spine` says it in colour alone.
   *
   * A spine never carries text, so the belt has to be readable as words from
   * somewhere — that is what keeps it accessible rather than decorative: the
   * `aria-label` it always carries, plus a tooltip on the host for a sighted
   * reader (#1443).
   */
  readonly appearance = input<'badge' | 'spine'>('badge');

  /**
   * False where the belt is context and the count is said elsewhere — a
   * promotion row's belt at the time of a stripe event. Without it a dan
   * grade would print "1° dan" for a count of 0 that nobody passed.
   */
  readonly showStripes = input<boolean>(true);

  protected readonly paint = computed(() => beltPaint(this.belt()));

  readonly labelKey = computed(() => this.ladder.labelKey(this.belt()));

  private readonly clampedStripes = computed(() =>
    Math.max(0, Math.min(this.ladder.stripeCap(this.belt()), Math.trunc(this.stripes()))),
  );

  /** One tile per stripe — only where a stripe is something on the belt. */
  readonly stripeTiles = computed(() =>
    this.showStripes() && this.ladder.countsStripes(this.belt())
      ? Array.from({ length: this.clampedStripes() })
      : [],
  );

  /** "3° dan" for a grade that counts dan or poom; null where tiles say it. */
  readonly countLabel = computed(() => {
    this.languageService.currentLang(); // re-translate on a locale toggle
    return !this.showStripes() || this.ladder.countsStripes(this.belt())
      ? null
      : this.ladder.stripesLabel(this.belt(), this.clampedStripes());
  });

  /**
   * The pill's paint: the main colour, and the second one as a band at the
   * end. The text colour is always the main colour's own ink.
   */
  readonly style = computed<Record<string, string>>(() => {
    const { main, tip } = this.paint();
    return {
      background:
        tip === null
          ? beltColourVar(main)
          : `linear-gradient(90deg, ${beltColourVar(main)} 0 calc(100% - var(--budojo-belt-band)), ${beltColourVar(tip)} calc(100% - var(--budojo-belt-band)) 100%)`,
      color: beltInkVar(main),
      // The same theme-aware hairline the spine carries (#1793): a white belt
      // on a white card, a black one on a dark card, and a black band at the
      // end of a pill all need an edge to exist at all.
      'box-shadow': 'inset 0 0 0 1px var(--budojo-belt-edge)',
    };
  });

  /**
   * The spine's paint. A vertical bar splits along its length the way a
   * physical two-colour belt does, and with no text on it both halves can be
   * shown in full.
   */
  readonly spineStyle = computed<Record<string, string>>(() => {
    const { main, tip } = this.paint();
    return {
      background: `linear-gradient(180deg, ${beltColourVar(main)} 0 50%, ${beltColourVar(tip ?? main)} 50% 100%)`,
      color: beltInkVar(main),
    };
  });
}
