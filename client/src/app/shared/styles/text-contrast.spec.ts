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

/**
 * Resolve a token to a hex, following `var(--other)` indirection. A chain, not
 * one step: the toast inks (#1908) read `--p-text-color`, which reads
 * `--p-surface-900`. Each link is looked up in the mode's own half first, as
 * the cascade does on the root element that carries both `:root` and `.dark`.
 */
function resolve(token: string, mode: 'light' | 'dark'): string | null {
  const read = (name: string, where: string): string | null => {
    const hits = [...where.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))];
    return hits.length ? hits[hits.length - 1][1].trim() : null;
  };
  // Dark overrides a subset; anything it does not redeclare falls through.
  const lookup = (name: string): string | null =>
    (mode === 'dark' ? read(name, halves.dark) : null) ?? read(name, halves.light);

  let value = lookup(token);
  for (let hop = 0; value !== null && hop < 4; hop++) {
    const indirect = /^var\(\s*--([a-z0-9-]+)\s*\)$/.exec(value);
    if (!indirect) break;
    value = lookup(indirect[1]);
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
  // Status chips (#1793). A `p-tag` is 12px/600 — body text by AA's reckoning,
  // not large — and it is the whole content of the paid/unpaid column, so it
  // is read more often than most prose in the app. Each ink is checked on its
  // own fill rather than on a page surface: the fill is what it is painted on.
  //
  // These are tokens at all because they used to be eight literals tuned for
  // white, which made every chip on a dark roster a near-white block. Putting
  // them here is what stops the dark pair being chosen by eye.
  { token: 'budojo-success-ink', on: ['budojo-success-soft'], floor: 4.5 },
  { token: 'budojo-warning-ink', on: ['budojo-warning-soft'], floor: 4.5 },
  { token: 'budojo-danger-ink', on: ['budojo-danger-soft'], floor: 4.5 },
  { token: 'budojo-info-ink', on: ['budojo-info-soft'], floor: 4.5 },
  // Toasts (#1908). The banner is `--p-content-background` at 92%, over the
  // page; checked on both. The dark toast shipped near-black on near-black,
  // an empty panel, because PrimeNG picked its ink by palette index.
  ...(['success', 'info', 'warn', 'error'] as const).flatMap((severity) => [
    {
      token: `p-toast-${severity}-color`,
      on: ['p-content-background', 'p-surface-50'],
      floor: 4.5,
    },
    {
      token: `p-toast-${severity}-detail-color`,
      on: ['p-content-background', 'p-surface-50'],
      floor: 4.5,
    },
  ]),
];

/**
 * A fill that marks something on a card has to differ from the card (#2138).
 * In the dark ramp `--p-surface-100` IS `--p-content-background`, so a fill
 * borrowed from the light theme vanishes into the card it sits on: the
 * skeletons did (#1793), and the secondary buttons did after them, reading as
 * plain words beside a link.
 */
const STEP = 1.05;

describe('a fill on a card differs from the card, in both themes (#1793, #2138)', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const fill of [
      'budojo-skeleton-background',
      'budojo-button-secondary-background',
      'budojo-button-secondary-hover-background',
    ]) {
      it(`${mode}: --${fill} is a step against the card`, () => {
        const paint = resolve(fill, mode);
        const card = resolve('p-content-background', mode);
        expect(paint, `--${fill} did not resolve to a hex in ${mode}`).not.toBeNull();
        expect(card).not.toBeNull();
        // A step the eye sees, not one digit of hex: light's surface-100 on
        // white is 1.09:1, the lightest step the design uses.
        expect(contrast(paint as string, card as string)).toBeGreaterThanOrEqual(STEP);
      });
    }

    it(`${mode}: the secondary hover is a step against its resting fill`, () => {
      const resting = resolve('budojo-button-secondary-background', mode);
      const hover = resolve('budojo-button-secondary-hover-background', mode);
      expect(resting).not.toBeNull();
      expect(hover).not.toBeNull();
      expect(contrast(resting as string, hover as string)).toBeGreaterThanOrEqual(STEP);
    });
  }

  it('the secondary button is painted with them, resting and hovered', () => {
    // The tokens prove nothing if the variant stops reading them: a revert to
    // `--p-surface-100` would leave every case above green.
    const variants = readFileSync(join(process.cwd(), 'src/styles/budojo-variants.scss'), 'utf8');
    const rule = /\.p-button-outlined,\s*\.p-button\.p-button-secondary[^{]*\{([\s\S]*?)\n\}/.exec(
      variants,
    );
    expect(rule, 'the secondary variant rule was not found').not.toBeNull();
    const body = (rule as RegExpExecArray)[1];
    expect(body).toMatch(/^\s*background:\s*var\(--budojo-button-secondary-background\);/m);
    expect(body).toMatch(
      /&:hover[^{]*\{\s*background:\s*var\(--budojo-button-secondary-hover-background\);/,
    );
  });

  it('the step catches a fill one digit away from the card', () => {
    expect(contrast('#1c1c1f', '#1c1c1e')).toBeLessThan(STEP);
  });
});

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
    // And that the status pairs really are re-declared in the dark half —
    // a token that falls through resolves to the light value and passes the
    // dark cases above while shipping a pastel block on a near-black page.
    expect(resolve('budojo-danger-soft', 'dark')).not.toBe(resolve('budojo-danger-soft', 'light'));
    expect(resolve('budojo-info-ink', 'dark')).not.toBe(resolve('budojo-info-ink', 'light'));
  });
});
