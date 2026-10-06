import { Athlete } from '../../../../core/services/athlete.service';
import { moneyRows } from './money-rows';

const athlete = (id: number, over: Partial<Athlete> = {}): Athlete =>
  ({
    id,
    first_name: `A${id}`,
    last_name: 'Rossi',
    belt: 'white',
    stripes: 0,
    status: 'active',
    is_self: false,
    monthly_fee_cents: 6000,
    billing_period_months: 1,
    billing_floor: '2026-01-01',
    payment_coverage: 'none',
    paid_current_month: false,
    active_carnet: null,
    ...over,
  }) as Athlete;

const OCT = '2026-10';
const NOBODY = new Set<number>();
const NONE = new Map<number, ReadonlySet<string>>();

describe('moneyRows', () => {
  it('names this month first, and the months behind as the rest', () => {
    const { others } = moneyRows(
      [athlete(1)],
      new Map([[1, ['2026-07', '2026-08']]]),
      OCT,
      NONE,
      NOBODY,
    );
    expect(others).toHaveLength(1);
    expect(others[0].lead).toBe(OCT);
    expect(others[0].also).toEqual(['2026-07', '2026-08']);
    expect(others[0].oldest).toBe('2026-07');
  });

  it('leads with the oldest month for someone who paid this one', () => {
    const paid = athlete(1, { payment_coverage: 'monthly' });
    const { others } = moneyRows([paid], new Map([[1, ['2026-07', '2026-08']]]), OCT, NONE, NOBODY);
    expect(others[0].lead).toBe('2026-07');
    expect(others[0].also).toEqual(['2026-08']);
  });

  it("puts tonight's people first, in the roster's order", () => {
    const rows = moneyRows([athlete(1), athlete(2), athlete(3)], new Map(), OCT, NONE, new Set([3]));
    expect(rows.tonight.map((row) => row.athlete.id)).toEqual([3]);
    expect(rows.others.map((row) => row.athlete.id)).toEqual([1, 2]);
  });

  it('leaves out whoever the check-in would not ask', () => {
    const roster = [
      athlete(1, { payment_coverage: 'monthly' }),
      athlete(2, { monthly_fee_cents: 0 }),
      athlete(3, { is_self: true }),
      athlete(4, { monthly_fee_cents: null }),
      athlete(5, { billing_floor: '2026-11-01' }),
    ];
    const rows = moneyRows(roster, new Map(), OCT, NONE, NOBODY);
    expect(rows.tonight).toEqual([]);
    expect(rows.others).toEqual([]);
  });

  it('drops a paid month, and the row once nothing is left', () => {
    const behind = new Map([[1, ['2026-08']]]);
    const halfway = moneyRows([athlete(1)], behind, OCT, new Map([[1, new Set([OCT])]]), NOBODY);
    expect(halfway.others[0].lead).toBe('2026-08');
    expect(halfway.others[0].also).toEqual([]);

    const done = moneyRows([athlete(1)], behind, OCT, new Map([[1, new Set([OCT, '2026-08'])]]), NOBODY);
    expect(done.others).toEqual([]);
  });
});
