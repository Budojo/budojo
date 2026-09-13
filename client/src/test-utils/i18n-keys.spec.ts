import EN from '../../public/assets/i18n/en.json';
import IT from '../../public/assets/i18n/it.json';

/**
 * Lock-step regression trip-wire (#273). Fails CI the moment a key is
 * added to one translation file without its counterpart in the other —
 * which is exactly what would let an English-speaking user see a raw
 * `nav.something` key in production because someone forgot the
 * `it.json` update.
 *
 * Three checks:
 *   1. **Key parity** — walk both JSON object trees, collect leaf
 *      paths, assert the two sets are identical.
 *   2. **No empty stubs** — assert no leaf value is the empty string
 *      in either file. Catches the `"key": ""` placeholder pattern
 *      that bypasses parity but ships an invisible string to a user.
 *   3. **Placeholder parity** — `{{academy}}` is a name the code passes,
 *      not a word to translate. A terminology sweep over it.json once
 *      turned it into `{{accademia}}` (#1623), which key parity cannot
 *      see and which renders the placeholder verbatim to the reader.
 */
function collectLeafPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...collectLeafPaths(value as Record<string, unknown>, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

describe('i18n key parity (en.json ↔ it.json)', () => {
  it('every leaf key in en.json has a counterpart in it.json (and vice-versa)', () => {
    const enKeys = collectLeafPaths(EN);
    const itKeys = collectLeafPaths(IT);

    const missingInIt = enKeys.filter((k) => !itKeys.includes(k));
    const missingInEn = itKeys.filter((k) => !enKeys.includes(k));

    expect(
      { missingInIt, missingInEn },
      'add the missing keys to both files in the same PR — the trip-wire is by design (canon § discipline)',
    ).toEqual({ missingInIt: [], missingInEn: [] });
  });

  it('no leaf value is the empty string in either file (defensive against accidental ""-stubs)', () => {
    const empty: string[] = [];
    function walk(obj: Record<string, unknown>, file: 'en' | 'it', prefix = ''): void {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          walk(value as Record<string, unknown>, file, path);
        } else if (typeof value === 'string' && value.trim() === '') {
          empty.push(`${file}: ${path}`);
        }
      }
    }
    walk(EN, 'en');
    walk(IT, 'it');
    expect(empty).toEqual([]);
  });

  it('uses the same {{placeholders}} in both files — they are names, not words', () => {
    // The SET, not the list: a language may legitimately repeat a
    // placeholder its counterpart states once ("{{name}} … {{name}}"),
    // and that is not a mismatch.
    const placeholders = (value: string): string[] =>
      [...new Set([...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))].sort();

    const read = (obj: Record<string, unknown>, path: string): string | undefined => {
      let node: unknown = obj;
      for (const segment of path.split('.')) {
        if (node === null || typeof node !== 'object') return undefined;
        node = (node as Record<string, unknown>)[segment];
      }
      return typeof node === 'string' ? node : undefined;
    };

    const mismatched: string[] = [];
    for (const path of collectLeafPaths(EN)) {
      const en = read(EN, path);
      const it = read(IT, path);
      if (en === undefined || it === undefined) continue;
      const a = placeholders(en);
      const b = placeholders(it);
      if (a.join('|') !== b.join('|')) {
        mismatched.push(`${path}: en {{${a.join(', ')}}} vs it {{${b.join(', ')}}}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});
