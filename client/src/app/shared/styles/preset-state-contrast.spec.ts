import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Material from '@primeuix/themes/material';

/**
 * PrimeNG's own interactive states stay readable in the dark theme (#2010).
 *
 * The dark ramp is inverted (`no-inverted-ramp.spec.ts` says why), and the
 * Material preset does not know it. Its dark scheme paints a hovered or
 * focused menu item and option with `{surface.800}`, dark on its own ramp and
 * `#e5e5ea` on ours, under text that stays near-white: 1.13:1. Every `p-menu`
 * and `p-select` in the app did it, and the owner found it on the roster's
 * payment menu. The toggle buttons behind `p-selectbutton` did the same on
 * hover and on the chosen option.
 *
 * The stylesheets guard only covers our own SCSS; this is the same bug coming
 * from the preset. So: resolve every preset token the way the browser does
 * (the preset's dark scheme, then our `:root` and `.dark` restatements, which
 * sit outside the `primeng` layer and win), and hold every state background
 * against the text drawn on it, every state ground against the pale end of
 * the ramp, and every resting field icon against its field.
 */

const THEME = join(process.cwd(), 'src/styles/budojo-theme.scss');
const STATE = /-(hover|focus|active|checked|selected)-background$/;

/**
 * Pairs that are not text on a page ground, so a ratio between them means
 * nothing: galleria and image draw their buttons over a photo, and the
 * switch's "colour" is the knob's glyph on its own track. Budojo uses neither
 * galleria nor image; the switch knob is checked on screen, not here.
 */
const NOT_TEXT_ON_GROUND = /^--p-(galleria|image|toggleswitch-handle)-/;

/**
 * Icons that sit on a field at rest and have no state suffix to be found by:
 * a select's chevron, a number field's ±, an addon's glyph, the field icon
 * itself. Non-text UI, so WCAG 1.4.11's 3:1 against the field.
 */
const RESTING_PAIRS: readonly (readonly [ink: string, ground: string])[] = [
  ['--p-select-dropdown-color', '--p-select-background'],
  ['--p-inputnumber-button-color', '--p-form-field-background'],
  ['--p-inputgroup-addon-color', '--p-inputgroup-addon-background'],
  ['--p-form-field-icon-color', '--p-form-field-background'],
];

/**
 * A state ground that still names the light end of the ramp is the pale
 * block of #2010 even when its text is dark enough to pass (a number field's
 * ± hovered on `#e5e5ea` under a near-black glyph). These components never
 * show that ground, and why:
 *
 * - `button`: `budojo-variants.scss` restyles every variant's hover by
 *   selector, unlayered, and a press is a hover too;
 * - `datepicker-dropdown`: the same file makes the trigger transparent;
 * - `toggleswitch`: a track, not a ground for text; checked is restyled;
 * - the rest are components Budojo does not use. Start using one, and take it
 *   off this list.
 */
const PALE_BY_DESIGN =
  /^--p-(button|datepicker-dropdown|toggleswitch|autocomplete|inputchips|galleria|carousel|message|toast)-/;

/** What #2010 restated under `.dark`: the negative control takes them away. */
const RESTATED_FOR_2010 = [
  '--p-navigation-item-focus-background',
  '--p-navigation-item-active-background',
  '--p-list-option-focus-background',
  '--p-togglebutton-hover-background',
  '--p-togglebutton-checked-background',
  '--p-form-field-icon-color',
  '--p-form-field-disabled-color',
  '--p-inputnumber-button-color',
  '--p-inputnumber-button-hover-color',
  '--p-inputnumber-button-active-color',
  '--p-inputnumber-button-hover-background',
  '--p-inputnumber-button-active-background',
];

type Tree = { readonly [key: string]: unknown };

const source = readFileSync(THEME, 'utf8');

/** The body of the first top-level rule for `selector`, braces balanced. */
function rule(selector: string): string {
  const at = source.search(new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{`, 'm'));
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return '';
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const code = body.replace(/\/\/[^\n]*/g, '');
  for (const m of code.matchAll(/(--p-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const kebab = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** Preset tree → CSS variables, named as PrimeNG names them (`root` dropped). */
function flatten(tree: Tree, prefix: string, out: Record<string, string>): void {
  for (const [key, value] of Object.entries(tree)) {
    if (key === 'colorScheme' || key === 'css' || key === 'extend') continue;
    const name = key === 'root' ? prefix : `${prefix}-${kebab(key)}`;
    if (value !== null && typeof value === 'object') flatten(value as Tree, name, out);
    else if (typeof value === 'string') out[name] = value;
  }
}

interface Preset {
  readonly primitive: Tree;
  readonly semantic: Tree & { readonly colorScheme: { readonly dark: Tree } };
  readonly components: { readonly [name: string]: Tree & { colorScheme?: { dark?: Tree } } };
}

function darkVariables(without: readonly string[]): Record<string, string> {
  const preset = Material as unknown as Preset;
  const vars: Record<string, string> = {};
  flatten(preset.primitive, '--p', vars);
  flatten(preset.semantic, '--p', vars);
  flatten(preset.semantic.colorScheme.dark, '--p', vars);
  for (const [name, tokens] of Object.entries(preset.components)) {
    flatten(tokens, `--p-${name}`, vars);
    if (tokens.colorScheme?.dark) flatten(tokens.colorScheme.dark, `--p-${name}`, vars);
  }
  const root = declarations(rule(':root'));
  const dark = declarations(rule('.dark'));
  for (const name of without) delete dark[name];
  return { ...vars, ...root, ...dark };
}

function resolver(vars: Record<string, string>): (name: string) => string | null {
  const memo = new Map<string, string | null>();
  const resolve = (name: string, depth = 0): string | null => {
    if (memo.has(name)) return memo.get(name) ?? null;
    if (depth > 40 || !(name in vars)) return null;
    const value = vars[name]
      .replace(
        /\{([a-zA-Z0-9.]+)\}/g,
        (_, path: string) => `var(--p-${path.split('.').map(kebab).join('-')})`,
      )
      .replace(
        /var\((--p-[a-z0-9-]+)(?:,[^)]*)?\)/g,
        (_, ref: string) => resolve(ref, depth + 1) ?? '?',
      );
    memo.set(name, value);
    return value;
  };
  return resolve;
}

type Rgb = readonly [number, number, number];

/**
 * Hex, rgb(a), or the one `color-mix` shape the preset writes (a colour mixed
 * with `transparent`); any alpha is composited over `ground`.
 */
function rgb(value: string | null, ground: Rgb): Rgb | null {
  if (value === null) return null;
  const v = value.trim();
  if (v === 'transparent') return ground;
  const mix = v.match(/^color-mix\(in srgb,\s*(.+?)(?:\s+(\d+)%)?,\s*transparent(?:\s+(\d+)%)?\)$/);
  if (mix) {
    const colour = rgb(mix[1], ground);
    const share =
      (mix[2] !== undefined ? +mix[2] : mix[3] !== undefined ? 100 - +mix[3] : 50) / 100;
    return (
      colour &&
      (colour.map((c, i) => Math.round(c * share + ground[i] * (1 - share))) as unknown as Rgb)
    );
  }
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as unknown as Rgb;
  const fn = v.match(/^rgba?\(([^)]+)\)$/);
  if (!fn) return null;
  const [r, g, b, a = 1] = fn[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return [r, g, b].map((c, i) => Math.round(c * a + ground[i] * (1 - a))) as unknown as Rgb;
}

const luminance = (c: Rgb): number => {
  const f = (x: number): number =>
    (x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The variable a token finally names, following `{a.b}` and `var()` one hop at a time. */
function origin(vars: Record<string, string>, name: string, depth = 0): string {
  if (depth > 40 || !(name in vars)) return name;
  const v = vars[name].trim();
  const token = v.match(/^\{([a-zA-Z0-9.]+)\}$/);
  const variable = v.match(/^var\((--p-[a-z0-9-]+)\)$/);
  const next = token ? `--p-${token[1].split('.').map(kebab).join('-')}` : variable?.[1];
  return next ? origin(vars, next, depth + 1) : name;
}

/** Every way the dark theme draws a state or an icon that cannot be read. */
function failures(without: readonly string[] = []): string[] {
  const vars = darkVariables(without);
  const resolve = resolver(vars);
  const overlay = rgb(resolve('--p-surface-0'), [0, 0, 0]) ?? ([28, 28, 30] as const);
  const states = Object.keys(vars).filter(
    (name) => STATE.test(name) && !NOT_TEXT_ON_GROUND.test(name),
  );

  const unreadable = states
    .filter((name) => name.replace(/-background$/, '-color') in vars)
    .flatMap((name) => {
      const ground = rgb(resolve(name), overlay);
      const ink = ground && rgb(resolve(name.replace(/-background$/, '-color')), ground);
      if (!ground || !ink) return [`${name} ${resolve(name)} cannot be read as a colour`];
      const ratio = contrast(ground, ink);
      return ratio < 3 ? [`${name} ${resolve(name)} under its text: ${ratio.toFixed(2)}:1`] : [];
    });

  const pale = states
    .filter((name) => !PALE_BY_DESIGN.test(name))
    .filter((name) => /^--p-surface-(6|7|8|9)\d\d?$/.test(origin(vars, name)))
    .map((name) => `${name} is a pale block: it names ${origin(vars, name)}, light on this ramp`);

  const resting = RESTING_PAIRS.flatMap(([ink, ground]) => {
    const g = rgb(resolve(ground), overlay);
    const i = g && rgb(resolve(ink), g);
    if (!g || !i) return [`${ink} on ${ground} cannot be read as a colour`];
    const ratio = contrast(g, i);
    return ratio < 3 ? [`${ink} ${resolve(ink)} on ${ground}: ${ratio.toFixed(2)}:1`] : [];
  });

  return [...unreadable, ...pale, ...resting];
}

describe('PrimeNG interactive states stay readable in the dark theme (#2010)', () => {
  it('every state ground is readable, none is a pale block, and every field icon shows', () => {
    const report = failures();
    expect(
      report,
      `light on light, or dark on dark, in the dark theme:\n  ${report.join('\n  ')}\n` +
        'Restate the token under .dark in budojo-theme.scss, from the dark end of the ramp.',
    ).toEqual([]);
  });

  it('would have caught the payment menu: without the #2010 restatements, it fails', () => {
    // The negative control. If this passes vacuously, the sweep read nothing.
    const report = failures(RESTATED_FOR_2010);
    expect(report.some((line) => line.startsWith('--p-menu-item-focus-background'))).toBe(true);
    expect(report.some((line) => line.startsWith('--p-select-option-focus-background'))).toBe(true);
    expect(report.some((line) => line.startsWith('--p-togglebutton-checked-background'))).toBe(
      true,
    );
    // The ± hovered on a pale block under a dark glyph: readable, and wrong.
    expect(
      report.some((line) =>
        line.startsWith('--p-inputnumber-button-hover-background is a pale block'),
      ),
    ).toBe(true);
    // A select's chevron, near-black on near-black at rest.
    expect(report.some((line) => line.startsWith('--p-select-dropdown-color'))).toBe(true);
  });
});
