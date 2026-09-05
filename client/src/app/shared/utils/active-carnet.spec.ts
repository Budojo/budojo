import { activeCarnetOf } from './active-carnet';
import type { Carnet } from '../../core/services/carnet.service';

function carnet(over: Partial<Carnet> = {}): Carnet {
  return {
    id: 1,
    code: 'A7K2',
    athlete_id: 1,
    total_entries: 10,
    remaining_entries: 6,
    price_cents: 7000,
    purchased_at: '2026-01-10',
    valid_from: '2026-01-10',
    expires_at: '2027-01-10',
    is_active: true,
    ...over,
  };
}

describe('activeCarnetOf', () => {
  it('returns null when the athlete holds none', () => {
    expect(activeCarnetOf([])).toBeNull();
  });

  it('returns null when every carnet is spent or expired', () => {
    expect(activeCarnetOf([carnet({ is_active: false })])).toBeNull();
  });

  it('ignores carnets the server marked unspendable', () => {
    const spendable = carnet({ id: 2, code: 'LIVE' });
    expect(activeCarnetOf([carnet({ id: 1, is_active: false }), spendable])?.code).toBe('LIVE');
  });

  it('picks the earliest expiry, not the order the list arrived in', () => {
    // The list comes newest-purchase-first; the server spends the one
    // expiring soonest.
    const chosen = activeCarnetOf([
      carnet({ id: 9, code: 'NEWER', expires_at: '2027-08-01' }),
      carnet({ id: 4, code: 'SOONER', expires_at: '2026-11-01' }),
    ]);

    expect(chosen?.code).toBe('SOONER');
  });

  it('breaks an expiry tie on the lower id, matching the server ordering', () => {
    // Routine, not exotic: expires_at is derived from the purchase date, so
    // two packs bought on the same day share an expiry.
    const chosen = activeCarnetOf([
      carnet({ id: 12, code: 'LATER', expires_at: '2027-01-10' }),
      carnet({ id: 5, code: 'FIRST', expires_at: '2027-01-10' }),
    ]);

    expect(chosen?.code).toBe('FIRST');
  });

  it('does not reorder the array it was given', () => {
    const list = [
      carnet({ id: 9, code: 'NEWER', expires_at: '2027-08-01' }),
      carnet({ id: 4, code: 'SOONER', expires_at: '2026-11-01' }),
    ];

    activeCarnetOf(list);

    expect(list.map((c) => c.code)).toEqual(['NEWER', 'SOONER']);
  });
});
