import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Hover sticks on a touch screen (#2034): a tap leaves the pointer where it
 * was, and a tapped row or chip keeps its hover style as if selected. Two
 * halves keep hover to the pointers that have it:
 * - our own stylesheets pass through `scripts/postcss-hover-gate.cjs` at
 *   build time, which puts every `:hover` rule under `(hover: hover)`;
 * - PrimeNG's are injected at runtime, so on a touch screen its hover tokens
 *   take their resting values (`_touch-hover-tokens.scss`, generated).
 */
const require = createRequire(join(process.cwd(), 'package.json'));

describe('hover on a touch screen', () => {
  describe('our own :hover rules', () => {
    const postcss = require('postcss');
    const gate = require('./scripts/postcss-hover-gate.cjs');
    const run = (css: string): string => postcss([gate()]).process(css, { from: undefined }).css;
    /** Whitespace aside: the generated CSS spaces its braces its own way. */
    const flat = (css: string): string =>
      css
        .replace(/\s*([{}])\s*/g, ' $1 ')
        .replace(/\s+/g, ' ')
        .trim();

    it('apply only where a pointer hovers', () => {
      expect(flat(run('.row:hover { color: red; }'))).toBe(
        flat('@media (hover: hover) { .row:hover { color: red; } }'),
      );
    });

    it('split a selector list, gating only its hover half', () => {
      expect(flat(run('.row:hover, .row:focus-visible { color: red; }'))).toBe(
        flat(
          '.row:focus-visible { color: red; } @media (hover: hover) { .row:hover { color: red; } }',
        ),
      );
    });

    it('keep their place inside another media query', () => {
      expect(flat(run('@media (min-width: 768px) { .row:hover { color: red; } }'))).toBe(
        flat('@media (min-width: 768px) { @media (hover: hover) { .row:hover { color: red; } } }'),
      );
    });

    it('leave a rule already behind (hover: hover) alone', () => {
      const css = '@media (hover: hover) { .row:hover { color: red; } }';
      expect(flat(run(css))).toBe(flat(css));
    });

    it('leave every other rule untouched', () => {
      expect(flat(run('.row { color: red; } .row:focus { color: blue; }'))).toBe(
        flat('.row { color: red; } .row:focus { color: blue; }'),
      );
    });

    it('are wired into the build', () => {
      const config = JSON.parse(readFileSync(join(process.cwd(), 'postcss.config.json'), 'utf8'));
      expect(Object.keys(config.plugins)).toContain('./scripts/postcss-hover-gate.cjs');
    });
  });

  describe("PrimeNG's hover tokens", () => {
    it('are generated from the installed preset, and the partial is current', async () => {
      const { render } = require('./scripts/touch-hover-tokens.cjs');
      const preset = (await import('@primeuix/themes/material')).default;
      const partial = readFileSync(
        join(process.cwd(), 'src/styles/_touch-hover-tokens.scss'),
        'utf8',
      );

      expect(partial).toBe(await render(preset.components));
    });

    it('cover every hover token of the preset, whatever state it qualifies', async () => {
      // `checkedHoverBackground`, `selectedHoverColor` and `filledHoverBackground`
      // are hover tokens too: an earlier match on a leading `hover` skipped 26.
      const { analyse } = require('./scripts/touch-hover-tokens.cjs');
      const preset = (await import('@primeuix/themes/material')).default;

      // The few with no resting token to fall back on, and not a background
      // (which is transparent at rest). Pinned, so a new one is a decision.
      expect(analyse(preset.components).unmatched).toEqual([
        '--p-datatable-row-toggle-button-selected-hover-color',
        '--p-inplace-display-hover-color',
        '--p-tree-node-toggle-button-selected-hover-color',
        '--p-treetable-node-toggle-button-selected-hover-color',
      ]);
    });

    it('give a text button its resting, transparent background', () => {
      const partial = readFileSync(
        join(process.cwd(), 'src/styles/_touch-hover-tokens.scss'),
        'utf8',
      );

      expect(partial).toContain('--p-button-text-primary-hover-background: transparent;');
      expect(partial).toContain(
        '--p-button-primary-hover-background: var(--p-button-primary-background);',
      );
      expect(partial).toContain(
        '--p-checkbox-checked-hover-background: var(--p-checkbox-checked-background);',
      );
    });
  });
});
