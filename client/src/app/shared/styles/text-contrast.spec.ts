import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The semantic text tokens have to clear WCAG AA, in both themes (#1786).
 *
 * `--p-text-muted-color` shipped at `surface-500` (#8e8e93) and measured
 * **3.26:1** on white, 3.12 on the app background and 2.99 on a grouped cell.
 * AA for body text is 4.5. It paints 212 call sites of 12-14px text, which is
 * exactly the copy an academy owner squints at one-handed in a bright gym.
 * Placeholders were worse: **1.60:1**, not quiet but absent.
 *
 * Nothing caught it. It lints, it type-checks, it renders, it screenshots —
 * a washy grey looks like a design choice in every frame. And the dark theme
 * had already taken the step the light one had not, so a reviewer comparing
 * the two would have seen the right answer sitting beside the wrong one.
 *
 * So the check is arithmetic, not judgement: parse the real token values out
 * of `budojo-theme.scss` and compute the ratio. A palette tweak that drops a
 * text token below AA fails here instead of shipping.
 */

const THEME = join(process.cwd(), 'src/styles/budojo-theme.scss');

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channel = (pair: string): number => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(h.slice(0, 2)) +
    0.7152 * channel(h.slice(2, 4)) +
    0.0722 * channel(h.slice(4, 6))
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const source = readFileSync(THEME, 'utf8');

/**
 * The file declares light tokens at the top and overrides a subset under the
 * dark selector further down. Splitting on that selector and reading the LAST
 * definition in each half is what the cascade actually does — taking the
 * first match would have read the light value and reported dark as passing
 * even while it failed.
 */
// Match the RULE, not the word: line 13 of the theme mentions `.dark` in a
// comment, and splitting on that put every light token on the dark side of
// the cut. The negative control at the bottom of this file caught it.
const darkAt = source.search(/^\s*(\.dark|\[data-theme=['"]dark['"]\])\s*\{/m);
const halves = {
  light: source.slice(0, darkAt === -1 ? source.length : darkAt),
  dark: darkAt === -1 ? '' : source.slice(darkAt),
};

/** Resolve a token to a hex, following one level of `var(--other)` indirection. */
function resolve(token: string, mode: 'light' | 'dark'): string | null {
  const read = (name: string, where: string): string | null => {
    const hits = [...where.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))];
    return hits.length ? hits[hits.length - 1][1].trim() : null;
  };
  // Dark overrides a subset; anything it does not redeclare falls through.
  let value = (mode === 'dark' ? read(token, halves.dark) : null) ?? read(token, halves.light);
  if (value === null) return null;

  const indirect = /^var\(\s*--([a-z0-9-]+)\s*\)$/.exec(value);
  if (indirect) {
    value =
      (mode === 'dark' ? read(indirect[1], halves.dark) : null) ?? read(indirect[1], halves.light);
  }
  return value && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
}

/**
 * Text token against every surface it is actually painted on. `--p-surface-0`
 * is a card/cell, `-50` the app background, `-100` a grouped cell and the
 * resting form-field fill — a token that passes on white and fails on the
 * cell it usually sits on has not passed.
 */
const CASES: ReadonlyArray<{ token: string; on: readonly string[]; floor: number }> = [
  { token: 'p-text-color', on: ['p-surface-0', 'p-surface-50', 'p-surface-100'], floor: 4.5 },
  { token: 'p-text-muted-color', on: ['p-surface-0', 'p-surface-50', 'p-surface-100'], floor: 4.5 },
  { token: 'p-form-field-color', on: ['p-surface-0', 'p-surface-100'], floor: 4.5 },
  { token: 'p-form-field-placeholder-color', on: ['p-surface-0', 'p-surface-100'], floor: 4.5 },
];

describe('semantic text tokens clear WCAG AA in both themes (#1786)', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const { token, on, floor } of CASES) {
      for (const surface of on) {
        it(`${mode}: --${token} on --${surface}`, () => {
          const fg = resolve(token, mode);
          const bg = resolve(surface, mode);

          // A token that stops resolving is a rename that silently disarmed
          // this test — fail on it rather than skip, which is how a sweep
          // quietly stops sweeping.
          expect(fg, `--${token} did not resolve to a hex in ${mode}`).not.toBeNull();
          expect(bg, `--${surface} did not resolve to a hex in ${mode}`).not.toBeNull();

          const ratio = contrast(fg as string, bg as string);
          expect(
            ratio,
            `--${token} (${fg}) on --${surface} (${bg}) is ${ratio.toFixed(2)}:1, below ${floor}:1`,
          ).toBeGreaterThanOrEqual(floor);
        });
      }
    }
  }

  it('the sweep is actually reading the file, not passing on an empty set', () => {
    // The negative control the other guards in this folder all carry: prove
    // the parser found real values before trusting any assertion above.
    expect(resolve('p-surface-0', 'light')).toBe('#ffffff');
    expect(resolve('p-text-color', 'light')).toBe('#0a0a0b');
    expect(resolve('p-surface-0', 'dark')).not.toBe(resolve('p-surface-0', 'light'));
  });
});
