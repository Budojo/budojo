import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

/**
 * What the owner chose, which is not the same as what is on screen.
 *
 * `system` is a real answer, not the absence of one, which is why this is not
 * a boolean: "follow the OS" has to survive a restart and has to keep
 * following after it, and a two-state toggle cannot express it.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/** What is actually painted right now. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'] as const;

/**
 * Shared with the inline boot script in `index.html`. If you rename this,
 * rename it there too — they are the same key and there is no import between
 * them, because the script has to run before any bundle loads.
 */
const STORAGE_KEY = 'budojoTheme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * The SPA's active theme (#1793).
 *
 * The shape is `LanguageService`'s, deliberately: policy layer, detection
 * precedence, persistence only on an explicit choice. Anyone who has read one
 * can read the other.
 *
 * The theme itself is not new — `budojo-theme.scss` has carried a full dark
 * palette and `app.config.ts` has configured `darkModeSelector: '.dark'` for
 * a long time. What was missing was anything that adds the class, so 10.4 KB
 * of dark theme shipped in every bundle and no user could reach it. An owner
 * whose OS was in dark mode got the white app, at the side of a mat, with the
 * gym lights down.
 *
 * **Detection precedence on boot:**
 *   1. `localStorage.budojoTheme`, if it holds a supported value.
 *   2. `system` — which then resolves through `prefers-color-scheme`.
 *
 * Boot-time detection does **not** write back, same as the language service:
 * an inferred preference stays inferred, so installing on a new device with a
 * different OS setting does the right thing rather than replaying an old
 * machine's guess.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /** What the owner chose. */
  readonly preference = signal<ThemePreference>('system');

  /**
   * What the OS is asking for right now. Kept as a signal rather than read on
   * demand so `resolved` recomputes when the OS flips at sunset — the whole
   * point of `system` is that it keeps following.
   */
  private readonly systemPrefersDark = signal<boolean>(false);

  /** What is painted: the choice, or the OS when the choice is `system`. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    if (preference !== 'system') return preference;

    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  bootstrap(): void {
    this.preference.set(this.detectInitialPreference());
    this.watchSystem();
    this.apply();
  }

  setPreference(preference: ThemePreference): void {
    if (!THEME_PREFERENCES.includes(preference)) return;

    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // localStorage throws in Safari private mode and on a full quota. The
      // experience degrades to "the theme reverts next visit", which is not
      // worth a toast — same swallow as `LanguageService.setLanguage`.
    }
    this.preference.set(preference);
    this.apply();
  }

  private detectInitialPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && this.isSupported(stored)) return stored;
    } catch {
      // see setPreference() — same swallow.
    }

    return 'system';
  }

  /**
   * Follow the OS live.
   *
   * `addEventListener` on a `MediaQueryList` is the modern API; Safari only
   * grew it in 14, and this app already targets newer than that, so there is
   * no `addListener` fallback here on purpose — a dead branch is worse than
   * an absent one.
   *
   * No unsubscribe: the service is `providedIn: 'root'` and lives exactly as
   * long as the document it is listening to.
   */
  private watchSystem(): void {
    const view = this.document.defaultView;
    if (!view?.matchMedia) return;

    const query = view.matchMedia(DARK_QUERY);
    this.systemPrefersDark.set(query.matches);
    query.addEventListener('change', (event) => {
      this.systemPrefersDark.set(event.matches);
      this.apply();
    });
  }

  /**
   * The class goes on `<html>`, which is what `darkModeSelector: '.dark'` in
   * `app.config.ts` selects. `color-scheme` goes with it so the browser's own
   * chrome — form controls, scrollbars, the canvas behind a rubber-band
   * scroll — follows too; without it a dark app keeps white scrollbars.
   *
   * The window chrome is the one surface the class cannot reach. In Budojo
   * Desktop the title bar is painted by Windows from a value handed to
   * Electron at window creation — native paint, no cascade, no custom
   * properties — so it has to be pushed. Skipping it left a #fafafa bar welded
   * across the top of a near-black app, which is what `styles.scss` had warned
   * about in writing since #1379.
   *
   * Fire-and-forget: the bar is decoration, the theme is already applied, and
   * there is nothing useful to tell someone whose title bar stayed light.
   */
  private apply(): void {
    const root = this.document.documentElement;
    const resolved = this.resolved();
    const dark = resolved === 'dark';
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';

    // Optional all the way down, not just on `__BUDOJO__`. The bridge is
    // injected by a preload script — a separate build artefact, outside this
    // TypeScript program — so its type is a claim about what the shell
    // exposes, not a guarantee. `?.theme.apply` would throw on any shell that
    // predates this channel, during a paint, for a bar nobody is looking at.
    void this.document.defaultView?.__BUDOJO__?.theme?.apply?.(resolved)?.catch(() => undefined);
  }

  private isSupported(value: string): value is ThemePreference {
    return (THEME_PREFERENCES as readonly string[]).includes(value);
  }
}
