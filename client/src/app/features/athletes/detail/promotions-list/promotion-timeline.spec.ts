import type { AthletePromotion, PromotionGap } from '../../../../core/services/athlete.service';
import { composeTimeline, type TimelineEntry } from './promotion-timeline';

function row(
  id: number,
  recordedAt: string,
  over: Partial<AthletePromotion> = {},
): AthletePromotion {
  return {
    id,
    kind: 'stripe',
    from_belt: null,
    to_belt: null,
    from_stripes: 0,
    to_stripes: 1,
    belt_at_event: 'white',
    recorded_at: recordedAt,
    recorded_by: null,
    ...over,
  };
}

function gap(
  key: string,
  after: number | null,
  before: number | null,
  over: Partial<PromotionGap> = {},
): PromotionGap {
  const [kind, belt, stripes] = key.split(':');
  return {
    key,
    kind: kind as 'belt' | 'stripe',
    belt: belt as PromotionGap['belt'],
    from_belt: null,
    from_stripes: kind === 'stripe' ? Number(stripes) - 1 : null,
    to_stripes: kind === 'stripe' ? Number(stripes) : null,
    after: after === null ? null : { promotion_id: after, recorded_at: '2024-01-01' },
    before: before === null ? null : { promotion_id: before, recorded_at: '2026-01-01' },
    completes_promotion_id: null,
    ...over,
  };
}

/** The entries as short labels: `r<id>`, `g<key>`, `c<n>` for a collapsed run. */
function shape(entries: readonly TimelineEntry[]): string[] {
  return entries.map((e) =>
    e.kind === 'row' ? `r${e.row.id}` : e.kind === 'gap' ? `g${e.gap.key}` : `c${e.gaps.length}`,
  );
}

describe('composeTimeline (#1966)', () => {
  it('is the rows alone when nothing is missing', () => {
    const rows = [row(3, '2026-03-01'), row(2, '2025-03-01'), row(1, '2024-03-01')];
    expect(shape(composeTimeline(rows, [], new Set()))).toEqual(['r3', 'r2', 'r1']);
  });

  it('puts a missing step between its two neighbours, newest first like the rows', () => {
    const rows = [row(3, '2026-03-01'), row(1, '2024-03-01')];
    const gaps = [gap('stripe:white:2', 1, 3), gap('stripe:white:3', 1, 3)];

    // Oldest first on the wire; the list reads newest first, so the later step sits higher.
    expect(shape(composeTimeline(rows, gaps, new Set()))).toEqual([
      'r3',
      'gstripe:white:3',
      'gstripe:white:2',
      'r1',
    ]);
  });

  it('puts the steps after the last row above the newest one', () => {
    // `before: null` — between the last row and the athlete's belt today.
    const rows = [row(2, '2025-03-01'), row(1, '2024-03-01')];
    expect(shape(composeTimeline(rows, [gap('stripe:white:3', 2, null)], new Set()))).toEqual([
      'gstripe:white:3',
      'r2',
      'r1',
    ]);
  });

  it('keeps a step whose newer neighbour is on the previous page at the top of this one', () => {
    // Page 2 holds row 1 only; row 5 is on page 1.
    expect(
      shape(composeTimeline([row(1, '2024-03-01')], [gap('stripe:white:2', 1, 5)], new Set())),
    ).toEqual(['gstripe:white:2', 'r1']);
  });

  it('keeps a step whose older neighbour is on the next page at the bottom of this one', () => {
    // Page 1 holds row 5 only; row 1 is on page 2.
    expect(
      shape(composeTimeline([row(5, '2026-03-01')], [gap('stripe:white:2', 1, 5)], new Set())),
    ).toEqual(['r5', 'gstripe:white:2']);
  });

  it('shows nothing for a step with no neighbour on this page', () => {
    expect(
      shape(composeTimeline([row(9, '2026-09-01')], [gap('stripe:white:2', 1, 5)], new Set())),
    ).toEqual(['r9']);
  });

  it('folds more than two missing steps in a row into one, until it is opened', () => {
    const rows = [row(3, '2026-03-01'), row(1, '2024-03-01')];
    const gaps = [
      gap('stripe:purple:2', 1, 3),
      gap('stripe:purple:3', 1, 3),
      gap('stripe:purple:4', 1, 3),
    ];

    const folded = composeTimeline(rows, gaps, new Set());
    expect(shape(folded)).toEqual(['r3', 'c3', 'r1']);

    const run = folded[1];
    if (run.kind !== 'collapsed') throw new Error('expected a collapsed run');
    expect(shape(composeTimeline(rows, gaps, new Set([run.runKey])))).toEqual([
      'r3',
      'gstripe:purple:4',
      'gstripe:purple:3',
      'gstripe:purple:2',
      'r1',
    ]);
  });

  it('leaves two in a row unfolded', () => {
    const rows = [row(3, '2026-03-01'), row(1, '2024-03-01')];
    const gaps = [gap('stripe:purple:2', 1, 3), gap('stripe:purple:3', 1, 3)];
    expect(shape(composeTimeline(rows, gaps, new Set()))).not.toContain('c2');
  });

  it('hands the step an opening row stands for to that row, not to a ghost of its own', () => {
    // Jacopo: white 2 → 3 recorded, the opening row "→ blue" dated the day he was entered.
    const rows = [
      row(15, '2026-09-26', { kind: 'belt', from_belt: null, to_belt: 'blue', is_opening: true }),
      row(12, '2024-03-12'),
    ];
    const belt = gap('belt:blue:0', 12, null, { from_belt: 'white', completes_promotion_id: 15 });
    const gaps = [gap('stripe:white:4', 12, 15), belt];

    const entries = composeTimeline(rows, gaps, new Set());
    expect(shape(entries)).toEqual(['r15', 'gstripe:white:4', 'r12']);

    const opening = entries[0];
    if (opening.kind !== 'row') throw new Error('expected a row');
    expect(opening.completing).toBe(belt);
  });
});
