import type { AthletePromotion, PromotionGap } from '../../../../core/services/athlete.service';

/**
 * One line of the promotions timeline (#1966): a recorded row, a step no row
 * records (a "ghost"), or a run of more than two of those folded into one.
 */
export type TimelineEntry =
  | {
      readonly kind: 'row';
      readonly row: AthletePromotion;
      /** The belt step this opening row stands for, when the history shows the belt before it. */
      readonly completing: PromotionGap | null;
    }
  | { readonly kind: 'gap'; readonly gap: PromotionGap }
  | { readonly kind: 'collapsed'; readonly runKey: string; readonly gaps: readonly PromotionGap[] };

/** More than this many missing steps in a row fold into one line. */
const LONGEST_UNFOLDED_RUN = 2;

/**
 * The page's rows with the missing steps placed between them (#1966).
 *
 * Rows arrive newest first, a page at a time; gaps arrive oldest first for
 * the whole history. A gap sits below its newer neighbour when that row is
 * on this page, otherwise above its older one — so a gap whose neighbours
 * straddle two pages shows at the edge of each, next to the row it touches,
 * and a gap with neither neighbour here is not this page's to show. A gap
 * after the last row (`before: null`) sits above the newest row.
 *
 * A gap an opening row stands for is never a ghost of its own: it rides on
 * that row, which is what gets completed when the date is added.
 *
 * @param expanded the `runKey`s of folded runs the owner has opened
 */
export function composeTimeline(
  rows: readonly AthletePromotion[],
  gaps: readonly PromotionGap[],
  expanded: ReadonlySet<string>,
): TimelineEntry[] {
  const onPage = new Set(rows.map((r) => r.id));
  const completing = new Map<number, PromotionGap>();
  const below = new Map<number, PromotionGap[]>();
  const above = new Map<number, PromotionGap[]>();

  for (const gap of gaps) {
    if (gap.completes_promotion_id !== null) {
      completing.set(gap.completes_promotion_id, gap);
      continue;
    }
    const newer = gap.before?.promotion_id;
    const older = gap.after?.promotion_id;
    if (newer !== undefined && onPage.has(newer)) {
      push(below, newer, gap);
    } else if (older !== undefined && onPage.has(older)) {
      push(above, older, gap);
    }
  }

  const entries: TimelineEntry[] = [];
  for (const row of rows) {
    entries.push(...run(above.get(row.id), expanded));
    entries.push({ kind: 'row', row, completing: completing.get(row.id) ?? null });
    entries.push(...run(below.get(row.id), expanded));
  }
  return entries;
}

function push(map: Map<number, PromotionGap[]>, id: number, gap: PromotionGap): void {
  const list = map.get(id);
  if (list === undefined) {
    map.set(id, [gap]);
  } else {
    list.push(gap);
  }
}

/** One anchor's gaps, newest first like the rows, folded when the run is long and closed. */
function run(
  gaps: readonly PromotionGap[] | undefined,
  expanded: ReadonlySet<string>,
): TimelineEntry[] {
  if (gaps === undefined) return [];
  const newestFirst = [...gaps].reverse();
  const runKey = newestFirst.map((g) => g.key).join('|');
  if (newestFirst.length > LONGEST_UNFOLDED_RUN && !expanded.has(runKey)) {
    return [{ kind: 'collapsed', runKey, gaps: newestFirst }];
  }
  return newestFirst.map((gap) => ({ kind: 'gap', gap }));
}
