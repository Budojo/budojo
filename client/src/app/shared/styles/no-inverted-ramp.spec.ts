import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The surface scale runs the OTHER WAY in dark, so its indices are not
 * portable between themes (#1793).
 *
 * `--p-surface-0` is white in light and #1c1c1e in dark; `--p-surface-900` is
 * #0a0a0b in light and #f2f2f7 in dark. That inversion is deliberate and
 * load-bearing — it is what lets nineteen semantic tokens resolve correctly
 * without being restated in the dark block. The cost is that reaching past a
 * semantic into the scale itself means writing a value that flips.
 *
 * It flipped in four places, and every one of them was invisible for as long
 * as nothing in the app could add the `.dark` class:
 *
 *   - both shells' mobile topbar (`--p-surface-900` behind `--p-surface-0`
 *     text) came out as a near-WHITE bar with near-black text, pinned to the
 *     top of a dark app, on the primary form factor;
 *   - the expiring-documents row hover was a `:host-context(.dark)` rule —
 *     written FOR dark — reaching for `--p-surface-800`, which in dark is
 *     #e5e5ea, so hovering flashed a white block;
 *   - the video letterbox framed the thumbnail in white.
 *
 * PrimeNG makes the same mistake against us with its overlay backgrounds, and
 * `budojo-theme.scss` restates nine tokens to correct it. This is that bug in
 * our own stylesheets.
 *
 * The rule, then: a **background** does not name the top of the scale and a
 * **colour** does not name the bottom. Those are the two directions that
 * invert into their opposite. Use a semantic — `--p-content-background`,
 * `--budojo-chrome-*` — or, if the value genuinely must not move with the
 * theme (a video letterbox, the white knob on a green toggle), a literal with
 * the one-line comment the canon already requires for one.
 */

const APP = join(process.cwd(), 'src/app');
const THEME = join(process.cwd(), 'src/styles/budojo-theme.scss');

function stylesheets(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...stylesheets(full));
    else if (entry.endsWith('.scss')) out.push(full);
  }
  return out;
}

/** Comments are prose. Same reason as `no-ghost-token.spec.ts`. */
const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

/**
 * `background`, `background-color`, and the shorthand — but not
 * `background-image` or `background-position`, which carry no colour.
 */
const HIGH_END_FILL =
  /\bbackground(?:-color)?\s*:[^;]*var\(\s*--p-surface-(6\d\d?|7\d\d?|8\d\d?|9\d\d?)\s*[,)]/g;
/**
 * `color`, and NOT the `color` inside `background-color` / `border-color`.
 * `\b` sits happily between a hyphen and a letter, so `\bcolor` matched the
 * tail of every `background-color:` in the app and reported three correct
 * fallbacks as defects — which is how a guard earns the reputation that gets
 * it deleted.
 */
const LOW_END_INK = /(?<![\w-])color\s*:[^;]*var\(\s*--p-surface-(0|50|100)\s*[,)]/g;

const files = stylesheets(APP);

interface Hit {
  readonly at: string;
  readonly what: string;
}

function sweep(pattern: RegExp, label: string): Hit[] {
  return files.flatMap((file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    return [...css.matchAll(new RegExp(pattern.source, 'g'))].map((m) => ({
      at: `${file.slice(APP.length + 1)}:${css.slice(0, m.index).split('\n').length}`,
      what: `${label} --p-surface-${m[1]}`,
    }));
  });
}

describe('component stylesheets do not reach into the flipping end of the scale (#1793)', () => {
  it('no background paints the top of the surface scale', () => {
    const hits = sweep(HIGH_END_FILL, 'background:');
    const report = hits.map((h) => `  ${h.at}  ${h.what}`).join('\n');

    expect(
      hits,
      `these are near-black in light and near-WHITE in dark:\n${report}\n` +
        `Use a semantic (--p-content-background, --budojo-chrome-background) instead.`,
    ).toEqual([]);
  });

  it('no colour paints text from the bottom of the surface scale', () => {
    const hits = sweep(LOW_END_INK, 'color:');
    const report = hits.map((h) => `  ${h.at}  ${h.what}`).join('\n');

    expect(
      hits,
      `these are white in light and near-BLACK in dark:\n${report}\n` +
        `Use a semantic (--p-text-color, --budojo-chrome-color) instead.`,
    ).toEqual([]);
  });

  it('the sweep is reading real stylesheets, and the ramp really does invert', () => {
    // The negative control every guard in this folder carries. Without it a
    // broken glob reports a clean sweep over zero files.
    expect(files.length).toBeGreaterThan(50);

    // And the premise itself: if the dark ramp ever stopped inverting, this
    // whole rule would be superstition, and it should fail here rather than
    // keep rejecting correct code.
    const theme = readFileSync(THEME, 'utf8');
    const darkAt = theme.search(/^\s*\.dark\s*\{/m);
    expect(darkAt).toBeGreaterThan(0);
    const read = (half: string, token: string): string | null => {
      const hits = [...half.matchAll(new RegExp(`--p-surface-${token}:\\s*([^;]+);`, 'g'))];
      return hits.at(-1)?.[1]?.trim() ?? null;
    };
    const light = theme.slice(0, darkAt);
    const dark = theme.slice(darkAt);
    expect(read(light, '0')).toBe('#ffffff');
    expect(read(dark, '0')).toBe('#1c1c1e');
    expect(read(light, '900')).toBe('#0a0a0b');
    expect(read(dark, '900')).toBe('#f2f2f7');
  });

  it('catches the shape it is looking for', () => {
    // A guard that never sees a positive is a guard nobody has proved works.
    // The pattern is exercised here against the exact line that shipped.
    const shipped = '.topbar { background: var(--p-surface-900); }';
    expect([...shipped.matchAll(HIGH_END_FILL)]).toHaveLength(1);
    expect([...'.a { color: var(--p-surface-0); }'.matchAll(LOW_END_INK)]).toHaveLength(1);

    // …and does not fire on the cases that are fine: ink from the top of the
    // scale (which IS --p-text-color) and a fill from the bottom of it.
    expect([...'.a { color: var(--p-surface-900); }'.matchAll(HIGH_END_FILL)]).toHaveLength(0);
    expect([...'.a { background: var(--p-surface-100); }'.matchAll(LOW_END_INK)]).toHaveLength(0);
    // The false positive that made this guard fail on its first run: the
    // `color` at the end of `background-color` is not the `color` property.
    expect([
      ...'.a { background-color: var(--p-surface-50, transparent); }'.matchAll(LOW_END_INK),
    ]).toHaveLength(0);
    expect([...'.a { border-color: var(--p-surface-100); }'.matchAll(LOW_END_INK)]).toHaveLength(0);
  });
});
