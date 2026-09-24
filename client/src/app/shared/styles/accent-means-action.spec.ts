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
// `--p-primary-contrast-color` is the ink ON a filled indigo pill, not the
// accent itself, so it does not count.
const ACCENT_TEXT = /^\s*color:\s*var\(--p-primary-(?!contrast)/;

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith('.scss') ? [path] : [];
  });
}

/**
 * Every selector the rule on `lines[at]` sits in, innermost first: a nested
 * modifier (`&--low`) belongs to its data class as much as the class itself.
 * A selector list that prettier split across lines (`.a__count,` then `.b {`)
 * is read whole, not just its last line.
 */
function selectorChain(lines: string[], at: number): string[] {
  const chain: string[] = [];
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    depth += (lines[i].match(/}/g) ?? []).length;
    const opens = (lines[i].match(/{/g) ?? []).length;
    if (opens <= depth) {
      depth -= opens;
      continue;
    }
    let selector = lines[i].trim();
    while (i > 0 && lines[i - 1].trim().endsWith(',')) {
      i--;
      selector = `${lines[i].trim()} ${selector}`;
    }
    chain.push(selector);
    depth = 0;
  }
  return chain;
}

function onData(lines: string[], at: number): boolean {
  return selectorChain(lines, at).some((selector) => DATA_CLASS.test(selector));
}

function accentOnData(): string[] {
  return stylesheets(APP).flatMap((file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    return lines.flatMap((line, i) => {
      if (!ACCENT_TEXT.test(line)) return [];
      return onData(lines, i)
        ? [`${relative(APP, file)}:${i + 1} ${selectorChain(lines, i).join(' < ')}`]
        : [];
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
    const flat = [
      '.carnets__remaining {',
      '  font-size: 2rem;',
      '  color: var(--p-primary-color);',
    ];
    expect(ACCENT_TEXT.test(flat[2])).toBe(true);
    expect(onData(flat, 2)).toBe(true);

    const nested = ['.recap {', '  &__number {', '    color: var(--p-primary-color);'];
    expect(onData(nested, 2)).toBe(true);

    // A modifier nested under a data class is still that data.
    const modifier = ['.carnets__remaining {', '  &--low {', '    color: var(--p-primary-color);'];
    expect(onData(modifier, 2)).toBe(true);

    // A selector list split across lines, the data class on the first line.
    const list = ['.summary__count,', '.summary__label {', '  color: var(--p-primary-color);'];
    expect(onData(list, 2)).toBe(true);

    // A sibling block that closed before the rule does not count.
    const sibling = [
      '.coverage {',
      '  &__percentage {',
      '    font-size: 3rem;',
      '  }',
      '  &__link {',
      '    color: var(--p-primary-color);',
    ];
    expect(onData(sibling, 5)).toBe(false);
  });

  it('does not mistake the ink on an indigo pill for the accent', () => {
    expect(ACCENT_TEXT.test('  color: var(--p-primary-contrast-color);')).toBe(false);
    expect(ACCENT_TEXT.test('  color: var(--p-primary-600);')).toBe(true);
  });
});
