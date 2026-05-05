import { TestBed } from '@angular/core/testing';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  ConsentPayload,
  ConsentService,
} from './consent.service';

/**
 * ConsentService unit tests (#421).
 *
 * The service is the gate every analytics / marketing script will eventually
 * read, so the contract has to be solid:
 *   - first visit → `decided=false`, banner shows;
 *   - acceptAll / rejectNonEssential / save persist + flip `decided`;
 *   - a stale version on storage forces re-prompt;
 *   - corrupt storage degrades silently to a fresh prompt;
 *   - `essential` cannot be turned off.
 *
 * The TestBed is reset in beforeEach so each `inject(ConsentService)` runs
 * the constructor against a fresh localStorage state.
 */
describe('ConsentService', () => {
  beforeEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  function inject(): ConsentService {
    return TestBed.inject(ConsentService);
  }

  describe('on first visit', () => {
    it('starts undecided so the banner can render', () => {
      const svc = inject();
      expect(svc.decided()).toBe(false);
    });

    it('returns the pristine choices (essential on, others off)', () => {
      const svc = inject();
      expect(svc.choices()).toEqual({
        essential: true,
        preferences: false,
        analytics: false,
        marketing: false,
      });
    });

    it('hasConsent("essential") is always true regardless of state', () => {
      const svc = inject();
      expect(svc.hasConsent('essential')()).toBe(true);
    });

    it('hasConsent for non-essential categories is false until accepted', () => {
      const svc = inject();
      expect(svc.hasConsent('analytics')()).toBe(false);
      expect(svc.hasConsent('marketing')()).toBe(false);
      expect(svc.hasConsent('preferences')()).toBe(false);
    });
  });

  describe('acceptAll()', () => {
    it('flips every category to true and marks decided', () => {
      const svc = inject();
      svc.acceptAll();
      expect(svc.decided()).toBe(true);
      expect(svc.choices()).toEqual({
        essential: true,
        preferences: true,
        analytics: true,
        marketing: true,
      });
    });

    it('writes a payload with the current version + ISO timestamp to localStorage', () => {
      const svc = inject();
      svc.acceptAll();
      const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as ConsentPayload;
      expect(parsed.version).toBe(CONSENT_VERSION);
      expect(parsed.choices).toEqual({
        essential: true,
        preferences: true,
        analytics: true,
        marketing: true,
      });
      // ISO-8601 sanity check — no need to pin a specific value, just
      // assert the format the service writes.
      expect(parsed.savedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('hasConsent("analytics") flips to true reactively', () => {
      const svc = inject();
      const sig = svc.hasConsent('analytics');
      expect(sig()).toBe(false);
      svc.acceptAll();
      expect(sig()).toBe(true);
    });
  });

  describe('rejectNonEssential()', () => {
    it('keeps essential on, denies the other three, marks decided', () => {
      const svc = inject();
      svc.rejectNonEssential();
      expect(svc.decided()).toBe(true);
      expect(svc.choices()).toEqual({
        essential: true,
        preferences: false,
        analytics: false,
        marketing: false,
      });
    });

    it('persists the rejection so the banner does not re-show on next load', () => {
      const svc = inject();
      svc.rejectNonEssential();
      const parsed = JSON.parse(
        localStorage.getItem(CONSENT_STORAGE_KEY) as string,
      ) as ConsentPayload;
      expect(parsed.choices.analytics).toBe(false);
      expect(parsed.version).toBe(CONSENT_VERSION);
    });
  });

  describe('save() — Customise modal', () => {
    it('persists a granular set + forces essential back to true', () => {
      const svc = inject();
      svc.save({ preferences: true, analytics: false, marketing: true });
      expect(svc.choices()).toEqual({
        essential: true,
        preferences: true,
        analytics: false,
        marketing: true,
      });
      expect(svc.decided()).toBe(true);
    });
  });

  describe('hydration from storage', () => {
    it('restores a current-version payload on construction and skips the banner', () => {
      const payload: ConsentPayload = {
        version: CONSENT_VERSION,
        choices: { essential: true, preferences: true, analytics: true, marketing: false },
        savedAt: '2026-04-30T12:34:56.000Z',
      };
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));

      const svc = inject();
      expect(svc.decided()).toBe(true);
      expect(svc.choices().analytics).toBe(true);
      expect(svc.choices().marketing).toBe(false);
    });

    it('ignores a stale-version payload so the banner re-shows after a CONSENT_VERSION bump', () => {
      const stale: ConsentPayload = {
        version: CONSENT_VERSION - 1,
        choices: { essential: true, preferences: true, analytics: true, marketing: true },
        savedAt: '2024-01-01T00:00:00.000Z',
      };
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stale));

      const svc = inject();
      expect(svc.decided()).toBe(false);
      expect(svc.choices().analytics).toBe(false);
    });

    it('ignores a corrupt JSON payload and starts pristine', () => {
      localStorage.setItem(CONSENT_STORAGE_KEY, '{not-json');
      const svc = inject();
      expect(svc.decided()).toBe(false);
      expect(svc.choices()).toEqual({
        essential: true,
        preferences: false,
        analytics: false,
        marketing: false,
      });
    });
  });

  describe('reopen()', () => {
    it('flips decided back to false without clearing the persisted choices', () => {
      const svc = inject();
      svc.acceptAll();
      expect(svc.decided()).toBe(true);

      svc.reopen();
      expect(svc.decided()).toBe(false);
      // Choices stay so the banner renders pre-populated.
      expect(svc.choices().analytics).toBe(true);
      // Storage is untouched — the user has not made a NEW choice yet.
      const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
      expect(raw).not.toBeNull();
    });
  });
});
