import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A `var()` naming a custom property that does not exist, with no fallback,
 * is not a fallback — it is a deleted declaration (#1786).
 *
 * CSS drops the whole declaration at computed-value time. For an inherited
 * property like `color` that means it silently takes the parent's value, so
 * the element still renders, still looks plausible, and nothing anywhere
 * reports a problem. It lints, it type-checks, it screenshots.
 *
 * That is how three transitions never ran, a card lost its corner radius,
 * and **131 declarations across 53 files** asked for `--p-text-color-secondary`
 * — a name PrimeUIX does not define and this repo never declared — and got
 * full-ink body text instead of secondary text. Every one of those was
 * written to establish hierarchy, and every one of them was doing the
 * opposite.
 *
 * So: no more per-name whack-a-mole. Any `--p-*` or `--budojo-*` referenced
 * without a fallback has to resolve against the theme or the framework.
 *
 * A fallback is still allowed — `var(--x, 160ms)` degrades on purpose and is
 * a different decision. This catches the ones that degrade to nothing.
 */

const SRC = join(process.cwd(), 'src');
const THEME = join(SRC, 'styles/budojo-theme.scss');

function stylesheets(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...stylesheets(full));
    else if (entry.endsWith('.scss')) out.push(full);
  }
  return out;
}

const files = stylesheets(SRC);

/**
 * Every custom property this codebase declares anywhere, not just in the
 * theme: `_count-badge.scss`, `_toolbar-control.scss` and a few component
 * files declare their own locals, and a local is a real definition.
 */
const declared = new Set<string>();
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)) {
    declared.add(m[1]);
  }
}

/**
 * Names PrimeUIX emits at runtime that we consume without redeclaring.
 *
 * Kept as two narrow patterns rather than a list, and deliberately narrow:
 * a generous escape hatch turns this guard back into decoration. Verified
 * against `node_modules/@primeuix/themes` — the preset really does ship the
 * full colour ramps (`red: { 50…950 }`) and the `highlight` semantics.
 */
const FRAMEWORK_PROVIDED = [
  // Palette primitives: --p-{hue}-{50..950}.
  /^--p-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}$/,
  // Semantics the preset owns and our theme does not restate.
  /^--p-(primary|highlight|content|overlay|list|navigation)-[a-z-]+$/,
];

const isFrameworkProvided = (token: string): boolean =>
  FRAMEWORK_PROVIDED.some((pattern) => pattern.test(token));

/**
 * Comments are not code. `belt-badge.component.scss` explains its hardcoded
 * belt colours with the sentence "a blue belt is #1D4ED8, not
 * `var(--p-primary)`" — a name that genuinely does not exist, written down
 * precisely to say so. A sweep that reads prose reports the documentation as
 * the defect.
 */
const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

describe('no fallback-less var() naming a token that does not exist (#1786)', () => {
  const ghosts = files.flatMap((file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    // `var(--name)` with NO comma: a fallback is a deliberate degrade.
    return [...css.matchAll(/var\(\s*(--(?:p|budojo)-[a-z0-9-]+)\s*\)/g)]
      .filter((m) => !declared.has(m[1]) && !isFrameworkProvided(m[1]))
      .map((m) => ({
        token: m[1],
        at: `${file.slice(SRC.length + 1)}:${css.slice(0, m.index).split('\n').length}`,
      }));
  });

  it('every --p-* / --budojo-* used without a fallback resolves', () => {
    const report = ghosts.map((g) => `  ${g.at}  ${g.token}`).join('\n');
    expect(ghosts, `these resolve to nothing, so the declaration is dropped:\n${report}`).toEqual(
      [],
    );
  });

  it('the sweep is actually reading stylesheets and the theme', () => {
    // The negative control every guard in this folder carries. Without it a
    // broken glob would report a clean sweep over zero files.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(THEME);
    expect(declared.has('--p-text-muted-color')).toBe(true);
    expect(declared.has('--budojo-motion-decelerate')).toBe(true);
    // And a name we know is absent, so the membership test is discriminating
    // rather than always-true.
    expect(declared.has('--p-text-color-secondary')).toBe(false);
  });
});
