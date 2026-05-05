import { Injectable, Signal, computed, signal } from '@angular/core';

/**
 * Cookie / browser-storage consent categories (#421).
 *
 * Categories mirror `docs/legal/cookie-audit.md` § 4–5: today the SPA
 * itself sets only **strictly-necessary** artefacts (the Sanctum
 * `auth_token`, the `documents.showCancelled` UI preference, the
 * service-worker cache, the language preference). The other three
 * categories ship as gates so the moment we wire analytics / a
 * marketing pixel / an external embed those scripts can be loaded
 * conditionally on `hasConsent('analytics')` etc., per the Garante
 * guidelines of 10 June 2021.
 *
 * Ordering matches the banner UI (essential first, then preferences,
 * then non-essential pair) and the EU e-Privacy directive intent
 * (essential always-on, everything else opt-in).
 */
export type ConsentCategory = 'essential' | 'preferences' | 'analytics' | 'marketing';

/** Choices map keyed by category. `essential` is always `true` by
 *  contract — the service ignores any attempt to flip it. */
export type ConsentChoices = Record<ConsentCategory, boolean>;

/**
 * Persisted shape on `localStorage.budojoCookieConsent`. The version
 * field is the load-bearing piece: bumping `CONSENT_VERSION` makes a
 * stored payload look stale → service treats the user as
 * un-prompted → banner re-shows on next load. Use this when a new
 * tracking category lands or when the policy text changes
 * substantively.
 */
export interface ConsentPayload {
  version: number;
  choices: ConsentChoices;
  /** ISO-8601 timestamp of the moment the user saved the choice. */
  savedAt: string;
}

/** Bump this when introducing a new category or when the cookie-policy
 *  copy changes in a way that requires re-consent. Bumping invalidates
 *  every stored choice and re-shows the banner on next load. */
export const CONSENT_VERSION = 1;

/** Storage key intentionally namespaced under `budojo*` to match the
 *  pattern set by `budojoLang` (#273). */
export const CONSENT_STORAGE_KEY = 'budojoCookieConsent';

/** Default state when no choice has been recorded yet. Essential is
 *  locked on; everything else is denied so an analytics tag added
 *  before a re-consent ships still respects the silence-as-no rule. */
const PRISTINE_CHOICES: ConsentChoices = {
  essential: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

/**
 * Single source of truth for the user's cookie / storage consent.
 *
 * **Public surface.**
 *   - `decided()` — `Signal<boolean>` — `false` until the user clicks
 *     one of the three banner CTAs (or saves from the customise modal).
 *     The cookie banner subscribes to this and renders only when
 *     `false`. The CONSENT_VERSION mismatch path resets it to `false`.
 *   - `choices()` — `Signal<ConsentChoices>` — current decision per
 *     category. `essential` is always `true`.
 *   - `hasConsent(category)` — derived `Signal<boolean>` — what the
 *     analytics-loader (and any future gated script) reads. The signal
 *     reactively flips when the user opens "Manage cookies" and
 *     toggles a category.
 *   - `acceptAll()` / `rejectNonEssential()` / `save(choices)` —
 *     write paths. Each one persists + flips `decided()` to `true`.
 *
 * **Why a Service, not a guard or interceptor.**
 * A consent decision is application-wide read state with no HTTP
 * round-trip. Signals are the cheapest reactive shape, and a service
 * with `providedIn: 'root'` keeps a single instance for every reader
 * (banner, cookie-policy "Manage" link, future analytics-bootstrap).
 *
 * **localStorage vs. cookie.** localStorage simpler than a real
 * cookie for a client-only decision: the SPA's auth token is also
 * in localStorage (canon § cookie audit), and there is no
 * server-side session that would consume the consent state. If the
 * roadmap ever introduces a server-side consent log the storage can
 * dual-write without changing the public API of this service.
 *
 * **Failure mode.** Safari private mode + storage quota errors can
 * make `localStorage.setItem` throw; we swallow the throw and
 * degrade to "user is re-prompted on next session". A toast or
 * modal would be heavier-handed than the user expects here.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly choicesSignal = signal<ConsentChoices>({ ...PRISTINE_CHOICES });
  private readonly decidedSignal = signal<boolean>(false);

  readonly choices: Signal<ConsentChoices> = this.choicesSignal.asReadonly();
  readonly decided: Signal<boolean> = this.decidedSignal.asReadonly();

  constructor() {
    this.hydrateFromStorage();
  }

  /**
   * Return a reactive boolean for the given category. Components and
   * services that gate side effects on consent (e.g. a future
   * analytics bootstrap) read this signal directly and react to its
   * flips — no manual re-subscribe.
   *
   * `essential` always returns `true` regardless of the stored state:
   * the strictly-necessary artefacts are exempt from consent under
   * Art. 5.3 of the e-Privacy directive (canon § cookie audit).
   */
  hasConsent(category: ConsentCategory): Signal<boolean> {
    if (category === 'essential') {
      return computed(() => true);
    }
    return computed(() => this.choicesSignal()[category]);
  }

  /** Accept every category. Persists + closes the banner. */
  acceptAll(): void {
    this.persist({
      essential: true,
      preferences: true,
      analytics: true,
      marketing: true,
    });
  }

  /** Refuse every non-essential category. Persists + closes the banner. */
  rejectNonEssential(): void {
    this.persist({ ...PRISTINE_CHOICES });
  }

  /**
   * Save a custom set from the "Customise" modal. The `essential` flag
   * is forced back to `true` so a programmatic caller cannot flip the
   * locked category (the modal disables the checkbox; this is the
   * defence-in-depth layer).
   */
  save(choices: Omit<ConsentChoices, 'essential'>): void {
    this.persist({
      essential: true,
      preferences: choices.preferences,
      analytics: choices.analytics,
      marketing: choices.marketing,
    });
  }

  /**
   * Re-open the prompt. Used by the cookie-policy page's "Manage your
   * preferences" link so a user who already accepted can revisit. Does
   * NOT clear the persisted choice — it just flips the `decided`
   * signal back to `false` so the banner re-renders pre-populated
   * with the current values.
   */
  reopen(): void {
    this.decidedSignal.set(false);
  }

  /**
   * Read the localStorage payload at construction. Three branches:
   *   1. No payload → pristine state, banner shows.
   *   2. Payload with stale `version` → ignore, pristine, banner shows.
   *   3. Payload with current version → restore choices, banner stays hidden.
   *
   * All JSON / storage failures fall through to branch 1 so the SPA
   * never crashes on a corrupt key.
   */
  private hydrateFromStorage(): void {
    try {
      const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ConsentPayload>;
      if (parsed?.version !== CONSENT_VERSION) return;
      if (!parsed.choices) return;
      this.choicesSignal.set({
        essential: true,
        preferences: !!parsed.choices.preferences,
        analytics: !!parsed.choices.analytics,
        marketing: !!parsed.choices.marketing,
      });
      this.decidedSignal.set(true);
    } catch {
      // Corrupt JSON, blocked storage, anything else — treat as
      // un-prompted and let the banner ask again. No toast: a bad
      // storage entry is invisible to the user already.
    }
  }

  private persist(choices: ConsentChoices): void {
    this.choicesSignal.set(choices);
    this.decidedSignal.set(true);
    const payload: ConsentPayload = {
      version: CONSENT_VERSION,
      choices,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Same swallow as LanguageService.setLanguage — Safari private
      // mode / quota throws degrade to "re-prompt next session".
    }
  }
}
