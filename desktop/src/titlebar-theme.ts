/**
 * What colour the native window chrome is painted, for a given theme (#1793).
 *
 * `titleBarStyle: 'hidden'` keeps the real Windows buttons and lets us paint
 * the bar behind them ourselves — but that paint is a **native** value handed
 * to Electron, not CSS. It cannot read a custom property, cannot see a `.dark`
 * class, and does not change when the renderer's theme does. So the one place
 * the web app and the shell have to agree on a colour is here, in a module
 * both sides resolve through.
 *
 * `client/src/styles.scss` carried a note asking for exactly this before the
 * dark theme existed: the drag strip's `background` and `titleBarOverlay.color`
 * are the same surface seen from two sides, and moving one without the other
 * leaves a light rectangle welded around the window buttons.
 *
 * Pure on purpose — no `electron` import, no filesystem. `main.ts` does the IO.
 */

export type ResolvedTheme = 'light' | 'dark';

export interface TitleBarOverlay {
  readonly color: string;
  readonly symbolColor: string;
  readonly height: number;
}

/**
 * Deliberately ONE PIXEL SHORTER than `--budojo-titlebar-height` (40px). Not a
 * mismatch to tidy up — see #1424 and the long comment this replaced in
 * `main.ts`: the strip's hairline is the last pixel row *inside* the 40, and a
 * 40px native overlay covers it, so the line stops dead where the buttons
 * begin.
 */
export const TITLEBAR_OVERLAY_HEIGHT = 39;

/**
 * Each theme's page surface and its ink.
 *
 * These are `--p-surface-50` and `--p-surface-900` from
 * `client/src/styles/budojo-theme.scss`, by value. They are duplicated rather
 * than imported because there is no import to make — the main process has no
 * CSS — so the pairing is pinned by a spec instead, and the token
 * `--budojo-titlebar-background` on the CSS side carries a comment pointing
 * back here. If one moves, both move.
 */
const CHROME: Record<ResolvedTheme, { background: string; ink: string }> = {
  light: { background: '#fafafa', ink: '#1c1c1e' },
  dark: { background: '#151517', ink: '#f2f2f7' },
};

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === 'light' || value === 'dark';
}

export function titleBarOverlayFor(theme: ResolvedTheme): TitleBarOverlay {
  return {
    color: CHROME[theme].background,
    symbolColor: CHROME[theme].ink,
    height: TITLEBAR_OVERLAY_HEIGHT,
  };
}

/**
 * What the window paints before the renderer has drawn anything.
 *
 * The same surface as the page, so launching is a window appearing rather than
 * a white card that turns dark a beat later. This is why the resolved theme is
 * persisted at all: the main process cannot read the renderer's localStorage,
 * and asking it after boot is one frame too late.
 */
export function windowBackgroundFor(theme: ResolvedTheme): string {
  return CHROME[theme].background;
}

/** Serialise for `theme.json`. The whole file, so restoring is symmetrical. */
export function serialiseTheme(theme: ResolvedTheme): string {
  return `${JSON.stringify({ theme }, null, 2)}\n`;
}

/**
 * What was on screen when the app last closed, if anything readable was.
 *
 * Returns null for absent, unparseable, or a value that is not a theme — all
 * three mean the same thing to the caller ("no answer"), and none of them is
 * worth a distinct branch.
 */
export function readPersistedTheme(contents: string | null): ResolvedTheme | null {
  if (contents === null) return null;

  try {
    const parsed: unknown = JSON.parse(contents);
    const theme = (parsed as { theme?: unknown } | null)?.theme;

    return isResolvedTheme(theme) ? theme : null;
  } catch {
    return null;
  }
}

/**
 * The theme to paint the window with, before the renderer can say.
 *
 * Precedence mirrors `ThemeService`: a remembered answer wins, and the OS
 * decides otherwise. The remembered value is what was **resolved** last run,
 * not the preference — an owner on `system` gets last night's dark window and
 * then the renderer corrects it within the first frame if the OS has since
 * flipped, which is a far smaller artefact than a white flash every launch.
 */
export function resolveBootTheme(contents: string | null, systemPrefersDark: boolean): ResolvedTheme {
  return readPersistedTheme(contents) ?? (systemPrefersDark ? 'dark' : 'light');
}
