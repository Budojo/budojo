import { Grade } from '../../../core/services/academy.service';
import { Belt } from '../../../core/services/athlete.service';

/** A belt and its stripes: where a promotion lands. */
export interface Step {
  readonly belt: Belt;
  readonly stripes: number;
}

/**
 * The promotion a coach most often gives next (#2045), on the academy's own
 * ladder (#1801): one more stripe while the belt has room, then the next belt
 * with none. An adult skips the kids' grades in between; a child moves
 * through them and on. Null at the top of the ladder, or for a belt the
 * ladder does not hold: the sheet then asks rather than guesses.
 */
export function nextStep(grades: readonly Grade[], belt: Belt, stripes: number): Step | null {
  const at = grades.findIndex((grade) => grade.belt === belt);
  if (at === -1) return null;
  const grade = grades[at];
  if (stripes < grade.max_stripes) return { belt, stripes: stripes + 1 };
  const next = grades.slice(at + 1).find((candidate) => grade.kids || !candidate.kids);
  return next === undefined ? null : { belt: next.belt, stripes: 0 };
}
