import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The accent means action, selection or state, never data (#1852).
 *
 * Indigo on a button says "press this"; indigo on a selected chip says "this
 * one is on". When a percentage, a count or a rank is indigo too, the colour
 * stops meaning anything: the owner's eye is pulled to a number as if it were
 * a control, and a real control has to shout louder to be found. A number
 * earns its weight from size and weight, in ink.
 *
 * Which rule is "data" cannot be read from CSS, but our class names say it:
 * the big numbers are all `__number`, `__count`, `__remaining`, `__percentage`,
 * `__percent`, `__headline`, `__rank` or `__total`. This walks every component
 * stylesheet and fails when one of those sets its text `color` from the
 * accent. Charts are not covered on purpose: a chart's single hue may be the
 * accent (#1550), and a bar is not mistaken for a button.
 */

const APP = join(process.cwd(), 'src/app');
const DATA_CLASS = /(__|-)(number|count|remaining|percentage|percent|headline|rank|total)\b/;
const ACCENT_TEXT = /^\s*color:\s*var\(--p-primary-/;

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith('.scss') ? [path] : [];
  });
}

/** The selector line that opens the block `lines[at]` sits in. */
function enclosingSelector(lines: string[], at: number): string {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    depth += (lines[i].match(/}/g) ?? []).length;
    const opens = (lines[i].match(/{/g) ?? []).length;
    if (opens > depth) return lines[i].trim();
    depth -= opens;
  }
  return '';
}

function accentOnData(): string[] {
  return stylesheets(APP).flatMap((file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    return lines.flatMap((line, i) => {
      if (!ACCENT_TEXT.test(line)) return [];
      const selector = enclosingSelector(lines, i);
      return DATA_CLASS.test(selector) ? [`${relative(APP, file)}:${i + 1} ${selector}`] : [];
    });
  });
}

describe('the accent means action, selection or state, not data (#1852)', () => {
  it('never colours a number, a count or a rank with the accent', () => {
    expect(accentOnData()).toEqual([]);
  });

  it('would catch one, so the check above is not passing for want of a match', () => {
    // A guard that finds nothing because it cannot find anything is not a
    // guard. These are the shapes it has to recognise.
    const lines = [
      '.carnets__remaining {',
      '  font-size: 2rem;',
      '  color: var(--p-primary-color);',
    ];
    expect(ACCENT_TEXT.test(lines[2])).toBe(true);
    expect(DATA_CLASS.test(enclosingSelector(lines, 2))).toBe(true);
    const nested = ['.recap {', '  &__number {', '    color: var(--p-primary-color);'];
    expect(DATA_CLASS.test(enclosingSelector(nested, 2))).toBe(true);
  });
});
