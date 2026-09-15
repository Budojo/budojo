import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Angular's own `DatePipe` formats against `LOCALE_ID`, which this SPA never
 * sets — it picks the language with a runtime toggle instead. So `| date: …`
 * renders English month and day names under an Italian UI, and no toggle can
 * move them, because `LOCALE_ID` is resolved once at bootstrap.
 *
 * #1624 fixed six screens on the owner side and #1670 the three on the
 * athlete portal, each time by reaching for `LocaleDatePipe`. This keeps a
 * tenth from appearing: the defect is invisible to every other gate — it
 * lints, it type-checks, it renders a perfectly valid date — and it is only
 * ever caught by somebody reading the screen in the other language.
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

describe('no raw DatePipe in a template (#1624, #1670)', () => {
  const found = templates().flatMap((file) => {
    const html = readFileSync(file, 'utf8');
    return [...html.matchAll(/\|\s*date\s*:/g)].map((m) => ({
      file: file.slice(APP.length + 1),
      line: html.slice(0, m.index).split('\n').length,
    }));
  });

  it('reads the templates at all', () => {
    // Negative control: the rule below iterates a list built by this walk, so
    // a walk that found nothing would make it pass over nothing.
    expect(templates().length).toBeGreaterThan(50);
  });

  it('formats every date through the language the reader picked', () => {
    expect(found.map((f) => `${f.file}:${f.line}`)).toEqual([]);
  });
});
