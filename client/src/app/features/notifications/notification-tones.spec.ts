import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A category badge's white glyph clears the 3:1 floor on its tone (#1852).
 *
 * `.notification__badge` paints a white icon on a solid disc of the category's
 * tone. An icon is a graphical object, so WCAG 1.4.11 asks 3:1 against what it
 * sits on. The 500 shades read as the tone at a glance and fail it: teal 2.5,
 * orange 2.8, green 2.3, amber 2.2.
 *
 * The tones are PrimeUIX palette primitives, resolved at runtime, so this
 * reads the hex fallback beside each one. The fallbacks are those same
 * palette values, and a fallback that drifted from its token would be a bug
 * of its own. `--p-surface-500` is ours: it resolves from the theme.
 */

const SCSS = join(
  process.cwd(),
  'src/app/features/notifications/notifications-page.component.scss',
);
const THEME = join(process.cwd(), 'src/styles/budojo-theme.scss');
const WHITE = '#ffffff';

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

/** `name: var(--p-token, #hex)` pairs from the `$notification-tones` map. */
function tones(): { name: string; token: string; hex: string }[] {
  const source = readFileSync(SCSS, 'utf8');
  const map = /\$notification-tones:\s*\(([\s\S]*?)\);/.exec(source)?.[1] ?? '';
  return [...map.matchAll(/(\w+):\s*var\(--([a-z0-9-]+),\s*(#[0-9a-f]{6})\)/gi)].map((m) => ({
    name: m[1],
    token: m[2],
    hex: m[3],
  }));
}

/** Our own tokens resolve from the theme's light half, the one the badge is judged on. */
function themeHex(token: string): string | null {
  const light = readFileSync(THEME, 'utf8').split(/\.dark\b/)[0];
  const hit = new RegExp(`--${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(light);
  return hit ? hit[1] : null;
}

describe('notification category badges hold a white glyph at 3:1 (#1852)', () => {
  const all = tones();

  it('reads every tone in the map', () => {
    // A regex that stops matching would pass the loop below with no cases.
    expect(all.length).toBeGreaterThanOrEqual(11);
  });

  for (const { name, token, hex } of all) {
    it(`${name}: white on --${token}`, () => {
      const fill = token.startsWith('p-surface-') ? (themeHex(token) ?? hex) : hex;
      expect(contrast(WHITE, fill)).toBeGreaterThanOrEqual(3);
    });
  }
});
