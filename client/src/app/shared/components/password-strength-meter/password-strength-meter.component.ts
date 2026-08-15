import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Password strength feedback bar (#415). Sits under any `p-password`
 * input and renders one of five score buckets (0-4 from zxcvbn-ts)
 * as a coloured bar plus a translatable label.
 *
 * Why zxcvbn-ts:
 *
 * - Length-vs-class-mixing entropy model (NIST SP 800-63B canon)
 *   instead of the classic `min N + must contain symbol` checklist
 *   which actively encourages weak passwords with predictable
 *   substitutions. Krug § self-evidence: the meter tells the user
 *   "this is fine" or "try a longer phrase" without listing arbitrary
 *   character-class rules.
 * - Pure client-side — no network round-trip during typing. The
 *   HIBP breach check is server-side on submit (#415); the meter is
 *   the affordance that nudges the user BEFORE submit.
 *
 * The component is purely presentational: the parent owns the form
 * control + value, this just observes the typed string and renders.
 * Empty input shows nothing — Krug § self-evidence again, no point
 * in flashing "very weak" before the user has typed anything.
 *
 * **Lazy loading (#877 follow-up).** zxcvbn-ts ships ~700 kB of
 * dictionaries; loading it eagerly at module import time was the
 * single biggest hit on the register / reset-password / change-
 * password lazy chunks. The actual analyser + dictionaries are now
 * dynamic-imported on the FIRST non-empty password keystroke. The JS
 * loader caches the resolved module after that, so subsequent
 * keystrokes don't re-fetch. The empty-input branch — which is the
 * vast majority of mounts (any form with a password field that the
 * user never focused) — pays zero KB for the library.
 */

type Score = 0 | 1 | 2 | 3 | 4;

/** The analyser the component needs: a value in, a `{ score }` out. */
export type ZxcvbnFn = (value: string) => { score: number };

/**
 * How the component obtains its analyser. The production default
 * (`ZXCVBN_LOADER`) dynamic-imports the ~700 kB library on first use;
 * a test provides a synchronous fake so the spec never touches the
 * real code-split chunk.
 */
export type ZxcvbnLoader = () => Promise<ZxcvbnFn>;

/**
 * Module-level promise — once resolved, the loaded zxcvbn function
 * is cached and every subsequent caller reuses the same Promise. The
 * JS module loader does the heavy lifting; this constant just gives
 * us a type-safe handle on the result.
 */
let zxcvbnPromise: Promise<ZxcvbnFn> | null = null;

function loadZxcvbn(): Promise<ZxcvbnFn> {
  if (zxcvbnPromise !== null) return zxcvbnPromise;
  zxcvbnPromise = Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]).then(([core, common, en]) => {
    // Same options the eager path used to set; runs once on first
    // load. Common dictionary regardless of locale (leaked passwords,
    // dates, keyboard walks); English wordlist covers English
    // dictionary words. The IT translation of the strength labels
    // lives in our own i18n bundle, not zxcvbn-ts's `translations`.
    core.zxcvbnOptions.setOptions({
      dictionary: { ...common.dictionary, ...en.dictionary },
      graphs: common.adjacencyGraphs,
      useLevenshteinDistance: true,
    });
    return core.zxcvbn as ZxcvbnFn;
  });
  return zxcvbnPromise;
}

/**
 * The analyser loader, dependency-injected so it can be swapped in tests.
 *
 * Production default is the module-level `loadZxcvbn` above (a lazy,
 * memoised dynamic import). Specs override this token with a synchronous
 * fake: under the esbuild unit-test builder on a cold CI cache, `vi.mock`
 * does not intercept the code-split `import('@zxcvbn-ts/core')` chunk, so a
 * spec that relied on mocking the module timed out waiting for the real
 * 700 kB analyser. Injecting the loader keeps every dynamic import out of
 * the test path entirely — see `.claude/gotchas.md`.
 */
export const ZXCVBN_LOADER = new InjectionToken<ZxcvbnLoader>('ZXCVBN_LOADER', {
  providedIn: 'root',
  factory: () => loadZxcvbn,
});

@Component({
  selector: 'app-password-strength-meter',
  standalone: true,
  imports: [NgClass, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-strength-meter.component.html',
  styleUrl: './password-strength-meter.component.scss',
})
export class PasswordStrengthMeterComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly loadScorer = inject(ZXCVBN_LOADER);

  /**
   * Plain-text password value the parent form is currently
   * shepherding. Empty / null → meter renders nothing.
   */
  readonly password = input<string | null | undefined>(null);

  /**
   * Score signal — set asynchronously once zxcvbn finishes its dynamic
   * import + analysis. `null` while loading OR for empty input. The
   * UX accepts a ~10ms first-keystroke delay (after the import the
   * function is cached at module scope; subsequent keystrokes run
   * synchronously fast).
   */
  protected readonly score = signal<Score | null>(null);

  /**
   * Effect chained on the `password` input. On every value change we
   * either:
   *   - reset to null (empty / whitespace-only — the meter hides);
   *   - kick off (or reuse) the dynamic import + score the current
   *     value once the analyser is available.
   *
   * Stale-response guard: the `currentSequence` counter increments
   * every effect run; an in-flight import that resolves AFTER the
   * password has changed again sees its captured sequence != current
   * and bails before writing.
   */
  private currentSequence = 0;

  constructor() {
    effect(() => {
      const value = this.password() ?? '';
      const seq = ++this.currentSequence;
      if (value.length === 0 || value.trim().length === 0) {
        this.score.set(null);
        return;
      }
      void this.loadScorer()
        .then((zxcvbn) => {
          // Stale-response: another keystroke landed since we kicked off,
          // a later effect will re-score with the newer value.
          if (seq !== this.currentSequence) return;
          const result = zxcvbn(value);
          this.score.set(result.score as Score);
        })
        .catch(() => {
          // Swallow — primarily for the Vitest jsdom teardown path
          // where a component is destroyed mid-import and the language
          // packs try to resolve into a torn-down environment. The
          // production path doesn't tear down the environment under
          // a live SPA, so the only realistic catch site is the test
          // env. Leaving `score` at its current value (null or stale)
          // is fine — the next keystroke re-scores.
        });
    });
    // Defensive: zxcvbnPromise lives at module scope, so the cleanup
    // here is just the sequence counter — destroyRef is referenced so
    // future async cleanup hooks (cancel an in-flight import, etc.)
    // have a typed handle.
    this.destroyRef.onDestroy(() => {
      this.currentSequence = -1;
    });
  }

  /**
   * Translate-key for the bucket label. `meter.bucket.${score}`
   * resolves to "Very weak" / "Weak" / "Reasonable" / "Strong" /
   * "Very strong". The IT translations live in `it.json` lock-step.
   */
  protected readonly labelKey = computed<string | null>(() => {
    const s = this.score();
    return s === null ? null : `auth.passwordMeter.bucket.${s}`;
  });

  /** CSS modifier for the bar fill — colour ramp keyed by score. */
  protected readonly variantClass = computed<string | null>(() => {
    const s = this.score();
    return s === null ? null : `password-meter__bar-fill--score-${s}`;
  });
}
