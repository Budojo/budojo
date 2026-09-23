import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Belt } from '../../core/services/athlete.service';
import { BELT_KEYS } from '../utils/i18n-enum-keys';
import { BeltColour, beltPaint } from '../utils/belt-palette';

/**
 * Every belt pill's text clears WCAG AA (#1801).
 *
 * The belt colours are domain constants, so they sit outside
 * `text-contrast.spec.ts`'s semantic tokens — and outside it they drifted:
 * white text on the BJJ green measured 3.30:1, on the orange 3.56:1, and the
 * coral red-and-white put dark text on red at 2.27:1 under a comment that said
 * it cleared AA. Nothing looked wrong in any screenshot.
 *
 * A pill's label is 12px semibold — body text for WCAG — so the bar is 4.5:1.
 * The label sits on the belt's main colour only (a two-colour belt shows its
 * second colour as a band at the end), so the pair to check is each colour
 * against its own `-ink`, read from the real values in `budojo-theme.scss`.
 */

const source = readFileSync(join(process.cwd(), 'src/styles/budojo-theme.scss'), 'utf8');

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

/** The token's value — the palette is theme-independent, so only one definition may exist. */
function token(name: string): string | null {
  const hits = [...source.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'g'))];
  return hits.length === 1 ? hits[0][1] : null;
}

const COLOURS: readonly BeltColour[] = [
  'white',
  'grey',
  'yellow',
  'orange',
  'green',
  'blue',
  'purple',
  'brown',
  'black',
  'red',
];

describe('belt pill contrast (#1801)', () => {
  it('finds each colour and its ink exactly once — a palette that does not change with the theme', () => {
    // The negative control: a renamed token or a dark-mode override would
    // otherwise make every assertion below pass over nothing.
    for (const colour of COLOURS) {
      expect(token(`budojo-belt-${colour}`), colour).not.toBeNull();
      expect(token(`budojo-belt-${colour}-ink`), `${colour}-ink`).not.toBeNull();
    }
  });

  it.each(COLOURS)('puts AA text on %s', (colour) => {
    const bg = token(`budojo-belt-${colour}`) as string;
    const ink = token(`budojo-belt-${colour}-ink`) as string;
    expect(contrast(bg, ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('builds every belt from those ten colours', () => {
    for (const belt of Object.keys(BELT_KEYS) as Belt[]) {
      const { main, tip } = beltPaint(belt);
      expect(COLOURS, belt).toContain(main);
      if (tip !== null) expect(COLOURS, belt).toContain(tip);
    }
  });

  it('would have caught the colours this replaced', () => {
    // The pairs as they shipped before #1801 — the check must fail them.
    expect(contrast('#16a34a', '#ffffff')).toBeLessThan(4.5);
    expect(contrast('#ea580c', '#ffffff')).toBeLessThan(4.5);
    expect(contrast('#b91c1c', '#1f2937')).toBeLessThan(4.5);
  });
});
