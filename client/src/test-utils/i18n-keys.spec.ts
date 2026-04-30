import EN from '../../public/assets/i18n/en.json';
import IT from '../../public/assets/i18n/it.json';

/**
 * Lock-step regression trip-wire (#273). Fails CI the moment a key is
 * added to one translation file without its counterpart in the other —
 * which is exactly what would let an English-speaking user see a raw
 * `nav.something` key in production because someone forgot the
 * `it.json` update.
 *
 * Two checks:
 *   1. **Key parity** — walk both JSON object trees, collect leaf
 *      paths, assert the two sets are identical.
 *   2. **No empty stubs** — assert no leaf value is the empty string
 *      in either file. Catches the `"key": ""` placeholder pattern
 *      that bypasses parity but ships an invisible string to a user.
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
});
