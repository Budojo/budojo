import { Athlete } from '../../../../core/services/athlete.service';
import {
  monthOf,
  monthsCovered,
  owedMonths,
  payChipOf,
  periodStarts,
  yearMonthOf,
} from './pay-chip';

const athlete = (over: Partial<Athlete> = {}): Athlete =>
  ({
    id: 1,
    first_name: 'Anna',
    last_name: 'Bianchi',
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

const NONE = new Set<string>();

describe('pay-chip', () => {
  describe('the months', () => {
    it('writes a month as the server does', () => {
      expect(monthOf(new Date(2026, 8, 30))).toBe('2026-09');
      expect(yearMonthOf('2026-09')).toEqual({ year: 2026, month: 9 });
    });

    it('covers a quarter across the new year', () => {
      expect(monthsCovered('2026-11', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
      expect(monthsCovered('2026-11', 1)).toEqual(['2026-11']);
    });
  });

  describe('owedMonths', () => {
    it('adds this month to the arrears when nothing pays it, oldest first', () => {
      expect(owedMonths(athlete(), ['2026-08'], '2026-10', NONE)).toEqual(['2026-08', '2026-10']);
    });

    it('leaves this month out when something pays it', () => {
      const covered = athlete({ payment_coverage: 'monthly' });
      expect(owedMonths(covered, ['2026-08'], '2026-10', NONE)).toEqual(['2026-08']);
    });

    it('leaves this month out when the billing floor has not reached it', () => {
      const later = athlete({ billing_floor: '2026-11-01' });
      expect(owedMonths(later, [], '2026-10', NONE)).toEqual([]);
    });

    it('drops what this screen paid', () => {
      expect(owedMonths(athlete(), ['2026-08'], '2026-10', new Set(['2026-08']))).toEqual([
        '2026-10',
      ]);
    });

    it('reads paid_current_month when the payload has no coverage', () => {
      const old = athlete({ payment_coverage: undefined, paid_current_month: false });
      expect(owedMonths(old, [], '2026-10', NONE)).toEqual(['2026-10']);
    });
  });

  describe('periodStarts', () => {
    it('is the months themselves for a monthly payer', () => {
      expect(periodStarts(['2026-08', '2026-09'], 1)).toEqual(['2026-08', '2026-09']);
    });

    it('owes a quarterly payer one quarter for two months behind, not three overlapping', () => {
      expect(periodStarts(['2026-09', '2026-08', '2026-10'], 3)).toEqual(['2026-08']);
    });

    it('starts a second period on the first month the first leaves out', () => {
      expect(periodStarts(['2026-02', '2026-03', '2026-06'], 3)).toEqual(['2026-02', '2026-06']);
    });
  });

  describe('payChipOf', () => {
    it('asks for the oldest month owed', () => {
      expect(payChipOf(athlete(), ['2026-08'], '2026-10', NONE)).toEqual({
        kind: 'due',
        month: '2026-08',
      });
    });

    it('moves on to the next month once one is paid here', () => {
      expect(payChipOf(athlete(), ['2026-08'], '2026-10', new Set(['2026-08']))).toEqual({
        kind: 'due',
        month: '2026-10',
      });
    });

    it('says covered once this month is paid here, though the roster said none', () => {
      expect(payChipOf(athlete(), [], '2026-10', new Set(['2026-10']))).toEqual({
        kind: 'covered',
      });
    });

    it('says covered when a fee period pays this month', () => {
      const quarterly = athlete({ payment_coverage: 'quarterly', billing_period_months: 3 });
      expect(payChipOf(quarterly, [], '2026-10', NONE)).toEqual({ kind: 'covered' });
    });

    it('says how many entries a carnet has left', () => {
      const holder = athlete({
        payment_coverage: 'carnet',
        active_carnet: { id: 4, code: 'C-4', remaining_entries: 3, expires_at: '2026-12-31' },
      });
      expect(payChipOf(holder, [], '2026-10', NONE)).toEqual({ kind: 'carnet', left: 3 });
    });

    it('still asks a carnet holder for a month the carnet did not pay', () => {
      const holder = athlete({
        payment_coverage: 'carnet',
        active_carnet: { id: 4, code: 'C-4', remaining_entries: 3, expires_at: '2026-12-31' },
      });
      expect(payChipOf(holder, ['2026-08'], '2026-10', NONE)).toEqual({
        kind: 'due',
        month: '2026-08',
      });
    });

    it('says free for someone whose own fee is zero, arrears or not', () => {
      expect(payChipOf(athlete({ monthly_fee_cents: 0 }), ['2026-08'], '2026-10', NONE)).toEqual({
        kind: 'free',
      });
    });

    it('shows nothing for the owner, for no fee, or for a month not yet billed', () => {
      expect(payChipOf(athlete({ is_self: true }), [], '2026-10', NONE)).toBeNull();
      expect(payChipOf(athlete({ monthly_fee_cents: null }), [], '2026-10', NONE)).toBeNull();
      expect(payChipOf(athlete({ billing_floor: '2026-11-01' }), [], '2026-10', NONE)).toBeNull();
    });

    it('shows nothing when the payload says nothing about this month', () => {
      const silent = athlete({ payment_coverage: undefined, paid_current_month: undefined });
      expect(payChipOf(silent, [], '2026-10', NONE)).toBeNull();
    });
  });
});
