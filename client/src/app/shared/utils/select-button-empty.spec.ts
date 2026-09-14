import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guard for `allowEmpty` on every `<p-selectbutton>` (#1675).
 *
 * PrimeNG defaults `allowEmpty` to **true**, so tapping the chip that is
 * already selected deselects it and emits `null`. Every select-button in this
 * app represents a closed choice — a range, a scope, a promotion kind, a
 * lesson type — with no "none of them" state, and each is bound either to a
 * signal typed as non-nullable or to a `nonNullable` form control. The null
 * therefore lands somewhere that cannot hold it: the stats pages sent
 * `?months=null` and took a 422 into the chart's error state, and the
 * promotion dialog silently swapped the kind the owner had picked.
 *
 * The audit named two of the four. The rule is cheaper to enforce than to
 * re-derive per control, so it is enforced over all of them — a new
 * select-button that genuinely needs a cleared state can opt out here with
 * the reason written down.
 */

const APP = join(process.cwd(), 'src/app');

function templates(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.html')) out.push(full);
    }
  };
  walk(APP);
  return out;
}

describe('select-button allowEmpty (#1675)', () => {
  const buttons = templates().flatMap((file) => {
    const html = readFileSync(file, 'utf8');
    return [...html.matchAll(/<p-selectbutton\b(.*?)\/>/gs)].map((m) => ({
      file: file.slice(APP.length + 1),
      line: html.slice(0, m.index).split('\n').length,
      attrs: m[1],
    }));
  });

  it('finds the select-buttons at all', () => {
    // Negative control: the rule below iterates this list, so a regex that
    // stopped matching would make it pass over nothing.
    expect(buttons.length).toBeGreaterThanOrEqual(8);
  });

  it('never lets a repeat tap clear a closed choice', () => {
    const unguarded = buttons
      .filter(({ attrs }) => !/\[allowEmpty\]="false"/.test(attrs))
      .map(({ file, line }) => `${file}:${line}`);
    expect(unguarded).toEqual([]);
  });
});
