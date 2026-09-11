import type { AthleteSortField, AthleteSortOrder } from '../../core/services/athlete.service';

/**
 * How a roster is currently ordered. `field: null` means nothing has been
 * chosen and the server's own default applies.
 */
export interface SortState {
  field: AthleteSortField | null;
  order: AthleteSortOrder;
}

/**
 * The sort cycles, in one place (#1526).
 *
 * They lived in `AthletesListComponent` alone, which is why the daily check-in
 * never got them: it draws the same roster, but it was still on PrimeNG's stock
 * two-state `pSortableColumn` for the name and had no belt control at all. Same
 * people, two different ways to order them — the shape #1458 fixed for the way
 * the two screens DREW a person.
 *
 * Pure functions rather than a service: they take a state and return the next
 * one, so each screen keeps owning its own signals and its own reload.
 */

/**
 * 4-state cycle for the synthetic "Full name" column (#196).
 *
 * The column is `first_name + last_name` glued client-side, so a single scalar
 * sort is degenerate — ties between same-first-name athletes sail through in
 * arbitrary order. The cycle picks which name LEADS as well as the direction:
 *
 *   none/other → first asc → first desc → last asc → last desc → first asc
 *
 * The backend honours the matching tiebreak (`applyNameSort`): the primary
 * column orders, then the other name field breaks ties in the same direction.
 *
 * Arriving from any non-name sort restarts at first asc — "alphabetical by
 * first name" is what someone reaching for a name header is asking for.
 */
export function nextNameSort({ field, order }: SortState): SortState {
  if (field === 'first_name' && order === 'asc') return { field: 'first_name', order: 'desc' };
  if (field === 'first_name' && order === 'desc') return { field: 'last_name', order: 'asc' };
  if (field === 'last_name' && order === 'asc') return { field: 'last_name', order: 'desc' };
  return { field: 'first_name', order: 'asc' };
}

/**
 * The two-character glyph the name header wears: the letter says which name
 * leads (`F` / `L`), the arrow says the direction. Null when a name is not what
 * the list is sorted by, so the header can fall back to its neutral `↕`.
 */
export function nameSortSignifier({ field, order }: SortState): string | null {
  if (field !== 'first_name' && field !== 'last_name') return null;
  return `${field === 'first_name' ? 'F' : 'L'}${order === 'asc' ? '↑' : '↓'}`;
}

/**
 * Translation key for the name header's tooltip — Norman § signifier: the
 * compact `F↑` carries the meaning at a glance, the tooltip spells it out the
 * first time.
 */
export function nameSortTooltipKey({ field, order }: SortState): string {
  if (field !== 'first_name' && field !== 'last_name') return 'shared.sort.nameInitial';
  if (field === 'first_name') {
    return order === 'asc' ? 'shared.sort.nameFirstAsc' : 'shared.sort.nameFirstDesc';
  }
  return order === 'asc' ? 'shared.sort.nameLastAsc' : 'shared.sort.nameLastDesc';
}

/**
 * `aria-sort` for the name `<th>`. WAI-ARIA only knows ascending / descending /
 * none — it cannot express WHICH name leads, so the direction goes here and the
 * lead reaches a screen reader through the button's aria-label, which mirrors
 * the tooltip.
 */
export function nameSortAria({ field, order }: SortState): 'ascending' | 'descending' | 'none' {
  if (field !== 'first_name' && field !== 'last_name') return 'none';
  return order === 'asc' ? 'ascending' : 'descending';
}

/**
 * Belt is two states, not three (#1457).
 *
 * The third "off" leg went with the default: belt is what the roster opens on,
 * so "stop sorting by belt" would drop the reader into insertion order — a
 * state that exists only as an accident of how rows were typed in, and one
 * nobody would choose on purpose. The sort still moves away from belt, just
 * through the other headers; this control then goes neutral and returns at
 * highest-rank-first when pressed again.
 */
export function nextBeltSort({ field, order }: SortState): SortState {
  if (field === 'belt') return { field: 'belt', order: order === 'desc' ? 'asc' : 'desc' };
  return { field: 'belt', order: 'desc' };
}

/** Translation key for the belt control's tooltip. Says what the state IS. */
export function beltSortTooltipKey({ field, order }: SortState): string {
  if (field !== 'belt') return 'shared.sort.beltInitial';
  return order === 'asc' ? 'shared.sort.beltAsc' : 'shared.sort.beltDesc';
}
