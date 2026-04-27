import { classifyExpiry } from './expiry-status-badge.component';

describe('classifyExpiry', () => {
  const today = new Date(2026, 3, 23); // April 23, 2026 local

  describe('medical_certificate', () => {
    it('returns "missing" when expires_at is null (red flag)', () => {
      expect(classifyExpiry(null, 'medical_certificate', today)).toBe('missing');
    });
  });

  describe('non-medical types without expiry', () => {
    it.each(['id_card', 'insurance', 'other'] as const)(
      'returns "none" for %s when expires_at is null',
      (type) => {
        expect(classifyExpiry(null, type, today)).toBe('none');
      },
    );
  });

  describe('with an expiry date', () => {
    it('returns "valid" when expiry is more than 30 days in the future', () => {
      expect(classifyExpiry('2026-07-01', 'medical_certificate', today)).toBe('valid');
    });

    it('returns "expiring" when expiry is exactly today + 30 days (boundary)', () => {
      // today = 2026-04-23, +30 days = 2026-05-23
      expect(classifyExpiry('2026-05-23', 'medical_certificate', today)).toBe('expiring');
    });

    it('returns "expiring" when expiry is 15 days out', () => {
      expect(classifyExpiry('2026-05-08', 'medical_certificate', today)).toBe('expiring');
    });

    it('returns "expiring" when expiry is today (not yet past)', () => {
      expect(classifyExpiry('2026-04-23', 'medical_certificate', today)).toBe('expiring');
    });

    it('returns "expired" when expiry is yesterday', () => {
      expect(classifyExpiry('2026-04-22', 'medical_certificate', today)).toBe('expired');
    });

    it('returns "expired" when expiry is a year in the past', () => {
      expect(classifyExpiry('2025-04-23', 'medical_certificate', today)).toBe('expired');
    });

    it('treats id_card the same as medical for the warning window', () => {
      expect(classifyExpiry('2026-05-08', 'id_card', today)).toBe('expiring');
    });
  });
});
