import { describe, it, expect } from 'vitest';
import { Academy } from '../../core/services/academy.service';
import { academyChargesAFee } from './academy-fee';

function academy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 1,
    name: 'Test',
    slug: 'test',
    address: null,
    logo_url: null,
    ...overrides,
  } as Academy;
}

describe('academyChargesAFee', () => {
  it('is false before the academy is loaded', () => {
    expect(academyChargesAFee(null)).toBe(false);
    expect(academyChargesAFee(undefined)).toBe(false);
  });

  it('is false for an academy with neither a flat fee nor a tier', () => {
    expect(academyChargesAFee(academy({ monthly_fee_cents: null, fee_tier_count: 0 }))).toBe(false);
  });

  it('is true for the flat-fee academy every academy starts as', () => {
    expect(academyChargesAFee(academy({ monthly_fee_cents: 6500 }))).toBe(true);
  });

  it('is true for an academy priced only by tier (#1381)', () => {
    // The case the old `monthly_fee_cents !== null` check got wrong: the paid
    // badge and the unpaid widget would vanish on an academy that plainly
    // charges its athletes.
    expect(academyChargesAFee(academy({ monthly_fee_cents: null, fee_tier_count: 2 }))).toBe(true);
  });

  it('counts a deliberate zero fee — the owner is still tracking who paid', () => {
    expect(academyChargesAFee(academy({ monthly_fee_cents: 0, fee_tier_count: 0 }))).toBe(true);
  });

  it('treats a missing fee_tier_count as no tiers, for pre-#1381 payloads', () => {
    expect(academyChargesAFee(academy({ monthly_fee_cents: null }))).toBe(false);
  });
});
