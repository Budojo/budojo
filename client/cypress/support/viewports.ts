/**
 * Multi-viewport coverage presets for Cypress (#240).
 *
 * The bug that motivated this — the phone country-code "+39" being
 * ellipsed on Pixel 8 Pro (#238) — could not be caught by Vitest unit
 * tests, and Cypress until now ran every spec at the default 1280×720
 * desktop viewport. Without responsive coverage, layout regressions
 * land in production where Luigi finds them.
 *
 * Convention: a feature spec that wants to assert layout invariants
 * iterates `MOBILE_VIEWPORTS` (or `ALL_VIEWPORTS`) at the top and
 * wraps each describe in a forEach. New specs that ONLY test business
 * logic stay at the Cypress default viewport — multi-viewport runs
 * cost CI time, so we apply them where the layout actually matters
 * (forms, lists, modals, navigation chrome).
 *
 * Mirror in budojo's design canon (client/CLAUDE.md § breakpoint
 * tokens):
 *   - <768px   = mobile
 *   - 768px    = tablet boundary
 *   - 1024px   = desktop boundary
 *   - 1440px   = wide desktop max
 *
 * The preset widths sit just inside each band so we exercise the
 * tightest representative case rather than the breakpoint edge.
 */

export interface Viewport {
  /** Human-readable name surfaced in the describe block label. */
  readonly name: string;
  /** CSS pixel width — passed straight to `cy.viewport`. */
  readonly width: number;
  /** CSS pixel height. */
  readonly height: number;
}

/** iPhone SE 2020 — the second-tightest mainstream iOS width. */
export const VIEWPORT_IPHONE_SE: Viewport = {
  name: 'iPhone SE',
  width: 375,
  height: 667,
};

/** Pixel 8 Pro — the device that surfaced #238. */
export const VIEWPORT_PIXEL_8_PRO: Viewport = {
  name: 'Pixel 8 Pro',
  width: 412,
  height: 915,
};

/** iPad mini portrait — the smallest tablet we explicitly support. */
export const VIEWPORT_TABLET: Viewport = {
  name: 'iPad mini',
  width: 768,
  height: 1024,
};

/** Baseline laptop — close to the Cypress default (1280×720) so a
 *  desktop-targeted assertion stays representative. */
export const VIEWPORT_DESKTOP: Viewport = {
  name: 'Desktop 1440',
  width: 1440,
  height: 900,
};

/** Both mobile devices — the high-yield smoke set. */
export const MOBILE_VIEWPORTS: readonly Viewport[] = [VIEWPORT_IPHONE_SE, VIEWPORT_PIXEL_8_PRO];

/** Mobile + tablet + desktop. Heavier — use only on flagship flows. */
export const ALL_VIEWPORTS: readonly Viewport[] = [
  VIEWPORT_IPHONE_SE,
  VIEWPORT_PIXEL_8_PRO,
  VIEWPORT_TABLET,
  VIEWPORT_DESKTOP,
];

/**
 * Play Store screenshot capture viewports (#690). Dimensions sized to
 * the strict per-slot ranges Google Play accepts (320-3840 phone/tablet-7,
 * 1080-7680 tablet-10), with phone bumped to 1080 wide so the resulting
 * PNG clears the "promotable" carousel threshold.
 *
 * Consumed by `cypress/marketing/play-store-screenshots.cy.ts` via the
 * `PLAY_STORE_VIEWPORTS` export below — the spec re-shapes each entry
 * into a `{slug, width, height}` triple (the slug is the canonical
 * `name` with the `play-store-` prefix stripped). Single source of
 * truth: change the dimensions here and the capture run picks them up.
 */
export const VIEWPORT_PLAY_STORE_PHONE: Viewport = {
  name: 'play-store-phone',
  width: 1080,
  height: 2400,
};

export const VIEWPORT_PLAY_STORE_TABLET_7: Viewport = {
  name: 'play-store-tablet-7',
  width: 1080,
  height: 1440,
};

export const VIEWPORT_PLAY_STORE_TABLET_10: Viewport = {
  name: 'play-store-tablet-10',
  width: 1600,
  height: 2560,
};

export const PLAY_STORE_VIEWPORTS: readonly Viewport[] = [
  VIEWPORT_PLAY_STORE_PHONE,
  VIEWPORT_PLAY_STORE_TABLET_7,
  VIEWPORT_PLAY_STORE_TABLET_10,
];
