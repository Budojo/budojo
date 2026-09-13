import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService } from '../../../core/services/language.service';
import {
  classifyExpiry,
  daysUntilExpiry,
  expiryCountdownKey,
  ExpiryStatusBadgeComponent,
} from './expiry-status-badge.component';

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

describe('daysUntilExpiry', () => {
  const today = new Date(2026, 3, 23); // April 23, 2026 local

  it('counts forward, backward, and to today', () => {
    expect(daysUntilExpiry('2026-05-09', today)).toBe(16);
    expect(daysUntilExpiry('2026-04-23', today)).toBe(0);
    expect(daysUntilExpiry('2026-04-19', today)).toBe(-4);
  });

  it('counts calendar days across a clock change, not milliseconds (#1625)', () => {
    // Europe/Rome moves off summer time on the last Sunday of October. A
    // ms difference over that boundary is an hour short of a whole day, and
    // `Math.ceil` rounded it up: 24 Oct → 23 Nov came out as 31 days, so a
    // certificate one day inside the 30-day window rendered green.
    expect(daysUntilExpiry('2026-11-23', new Date(2026, 9, 24))).toBe(30);
    expect(classifyExpiry('2026-11-23', 'medical_certificate', new Date(2026, 9, 24))).toBe(
      'expiring',
    );

    // And the March change gave `-0` for yesterday, which is not `< 0`, so a
    // document that had just expired read "scade oggi" in amber.
    expect(daysUntilExpiry('2026-03-29', new Date(2026, 2, 30))).toBe(-1);
    expect(classifyExpiry('2026-03-29', 'medical_certificate', new Date(2026, 2, 30))).toBe(
      'expired',
    );
  });

  it('has nothing to count to without an expiry', () => {
    expect(daysUntilExpiry(null, today)).toBeNull();
  });
});

describe('ExpiryStatusBadgeComponent (#1625)', () => {
  function mount(expiresAt: string | null, lang: 'en' | 'it' = 'it') {
    // One module per mount: TestBed refuses to be reconfigured once it has
    // been instantiated, and each of these tests mounts more than once.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ExpiryStatusBadgeComponent],
      providers: [...provideI18nTesting()],
    });
    TestBed.inject(LanguageService).setLanguage(lang);
    const fixture = TestBed.createComponent(ExpiryStatusBadgeComponent);
    fixture.componentRef.setInput('expiresAt', expiresAt);
    fixture.componentRef.setInput('type', 'medical_certificate');
    fixture.componentRef.setInput('today', new Date(2026, 3, 23));
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it("writes the status in the reader's language, not in hard-coded English", () => {
    // `Valid` / `Expiring` / `Expired` were string literals in the component.
    expect(mount('2026-05-09').componentInstance.label()).toBe('In scadenza');
    expect(mount('2026-04-19').componentInstance.label()).toBe('Scaduto');
    expect(mount('2027-01-01').componentInstance.label()).toBe('Valido');
    expect(mount('2027-01-01', 'en').componentInstance.label()).toBe('Valid');
  });
});

describe('expiryCountdownKey (#1625)', () => {
  it('picks the phrase and the number the sentence needs', () => {
    expect(expiryCountdownKey(16)).toEqual({
      key: 'shared.expiryCountdown.futureOther',
      count: 16,
    });
    expect(expiryCountdownKey(1)).toEqual({ key: 'shared.expiryCountdown.futureOne', count: 1 });
    expect(expiryCountdownKey(0)).toEqual({ key: 'shared.expiryCountdown.today', count: 0 });
    expect(expiryCountdownKey(-1)).toEqual({ key: 'shared.expiryCountdown.pastOne', count: 1 });
    expect(expiryCountdownKey(-4)).toEqual({ key: 'shared.expiryCountdown.pastOther', count: 4 });
  });
});
