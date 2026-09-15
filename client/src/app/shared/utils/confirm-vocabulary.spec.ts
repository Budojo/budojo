import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import EN from '../../../../public/assets/i18n/en.json';
import IT from '../../../../public/assets/i18n/it.json';

/**
 * Structural guard for the one rule every confirm in the app follows (#1644).
 *
 * The audit found the same question answered three ways — "Tieni / Rimuovi",
 * "Annulla / Elimina", "No / Sì" — with the safe action filled on some
 * screens and text on others, and four popups passing no labels at all so
 * PrimeNG drew its own "Yes"/"No" in one colour. That drift had already been
 * fixed once, in #1034, by extracting a shared destructive button; it came
 * back through the call sites that never adopted it.
 *
 * A spec rather than a convention, because a convention is what we had.
 */

const APP = join(process.cwd(), 'src/app');

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
    }
  };
  walk(APP);
  return out;
}

/** Every `…confirm({ … })` literal in the app, with the file it came from. */
function confirmCalls(): { file: string; body: string }[] {
  const calls: { file: string; body: string }[] = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\.confirm\(\{(.*?)\n\s*\}\);/gs)) {
      calls.push({ file: file.slice(APP.length + 1), body: match[1] });
    }
  }
  return calls;
}

describe('confirm vocabulary (#1644)', () => {
  const calls = confirmCalls();

  it('finds the confirm call sites at all', () => {
    // Negative control for the three tests below: they all iterate `calls`,
    // so a regex that silently stopped matching would make every one of them
    // pass over an empty list.
    expect(calls.length).toBeGreaterThan(10);
  });

  it('names its own action instead of leaving PrimeNG to say "Yes"', () => {
    // Without an acceptLabel the popup renders PrimeNG's defaults, in one
    // colour — so on the payments table the answer that wiped a recorded
    // payment looked exactly like the one that walked away.
    const unlabelled = calls.filter((c) => !c.body.includes('acceptLabel')).map((c) => c.file);
    expect(unlabelled).toEqual([]);
  });

  it('offers the same way out everywhere, through the one shared key', () => {
    // The shared destructive button takes `rejectLabel` as an input — its
    // HOSTS pass the key, which is what the template audit below checks.
    const wrong = calls
      .filter((c) => !c.file.includes('confirm-destructive-button'))
      .filter((c) => !c.body.includes('common.cancel'))
      .map((c) => c.file);
    expect(wrong).toEqual([]);
  });

  it('passes that same key from every template that opens a confirm', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles().map((f) => f.replace(/\.ts$/, '.html'))) {
      let html: string;
      try {
        html = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const m of html.matchAll(/\[rejectLabel\]="'([^']+)'/g)) {
        if (m[1] !== 'common.cancel') offenders.push(`${file.slice(APP.length + 1)} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the safe action quieter than the destructive one', () => {
    const unstyled = calls
      .filter((c) => !c.body.includes('CONFIRM_REJECT_BUTTON'))
      .map((c) => c.file);
    expect(unstyled).toEqual([]);
  });

  it('carries the cancel word in both bundles and nowhere else', () => {
    expect(EN.common.cancel).toBe('Cancel');
    expect(IT.common.cancel).toBe('Annulla');

    // The 21 per-feature keys that used to hold this word for a CONFIRM are
    // gone; a new one would be the drift starting over. A dialog's or a
    // form's own Cancel button is a different control and keeps its own key.
    const strays = Object.keys(flatten(IT))
      .filter((k) => /reject/i.test(k) || /confirm.*\.cancel$/i.test(k))
      .filter((k) => !k.startsWith('cookies.'));
    expect(strays).toEqual([]);
  });

  it("never answers a question with the question's own verb", () => {
    // "Annullare il pagamento?" answered by "Annulla" reads as yes, not no.
    // Both places this happened — the pending schedule change and the period
    // payment — were reworded rather than given a bespoke reject label.
    const asking = Object.entries(flatten(IT)).filter(
      ([k, v]) => k.includes('onfirm') && /\?$/.test(v),
    );
    expect(asking.length).toBeGreaterThan(5);
    const colliding = asking.filter(([, v]) => /\bannulla/i.test(v)).map(([k]) => k);
    expect(colliding).toEqual([]);
  });
});

function flatten(
  node: unknown,
  path = '',
  // NOT a default `= {}`: a default object literal is created once per
  // function definition, not once per call, so the second flatten() in this
  // file was returning the first one's keys merged in.
  out?: Record<string, string>,
): Record<string, string> {
  const acc = out ?? {};
  if (typeof node === 'string') {
    acc[path] = node;
    return acc;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flatten(v, path ? `${path}.${k}` : k, acc);
  }
  return acc;
}
