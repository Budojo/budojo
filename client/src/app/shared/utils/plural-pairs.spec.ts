import EN from '../../../../public/assets/i18n/en.json';
import IT from '../../../../public/assets/i18n/it.json';

/**
 * ngx-translate has no plural rule, and no compiler is configured (#1646).
 *
 * The convention is an explicit `…One` / `…Other` pair chosen at the call
 * site. Nothing enforced it, so sixteen strings interpolated a count into a
 * hardcoded plural and rendered "1 atleti", "1 attivi", "1 non lette". The
 * audit found two of them by eye.
 *
 * This pins the shape rather than the words: every key that interpolates a
 * count has a sibling for one, and no bundle smuggles in ICU syntax that the
 * runtime would print verbatim.
 */
type Bundle = Record<string, unknown>;

function flatten(node: Bundle, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') out[path] = value;
    else if (value !== null && typeof value === 'object')
      Object.assign(out, flatten(value as Bundle, path));
  }
  return out;
}

const BUNDLES: ReadonlyArray<[string, Bundle]> = [
  ['en', EN as unknown as Bundle],
  ['it', IT as unknown as Bundle],
];

describe('plural pairs (#1646)', () => {
  it.each(BUNDLES)('%s: no bundle uses ICU plural syntax, which nothing compiles', (_lang, b) => {
    // `{{count, plural, one {} other {s}}}` reached the screen verbatim,
    // because no TranslateCompiler is wired. It is not a subtle bug, it is a
    // brace salad in the middle of a sentence.
    const icu = Object.entries(flatten(b))
      .filter(([, v]) => /\{\{\s*\w+\s*,\s*(plural|select)\b/.test(v))
      .map(([k]) => k);
    expect(icu).toEqual([]);
  });

  it.each(BUNDLES)('%s: every counted string has a singular to choose', (_lang, b) => {
    const flat = flatten(b);
    const keys = new Set(Object.keys(flat));
    // Keys the audit and the sweep judged number-agnostic at one: a bare
    // parenthetical, a "×N" multiplier, or a value that never reaches 1.
    const AGNOSTIC = new Set([
      'athletes.coverage.missed.chances',
      'athletes.detail.carnets.confirmDelete',
      'athletes.detail.payments.periodMonths',
      'athletes.list.coverage.carnet',
      'documents.expiringList.countExpiring',
      'documents.expiringList.countMissing',
      'profile.sessions.revokeOthersToast.detail',
      'relativeDay.days',
      'relativeDay.weeks',
      'shared.unpaidWidget.viewAll',
      'stats.syllabus.missingList',
      'stats.syllabus.worked',
    ]);

    const missing = Object.entries(flat)
      .filter(([k, v]) => v.includes('{{count}}') && !AGNOSTIC.has(k))
      .map(([k]) => k)
      .filter((k) => {
        const base = k.replace(/(One|Other|Many)$/, '');
        return !(keys.has(`${base}One`) && (keys.has(`${base}Other`) || keys.has(`${base}Many`)));
      });

    expect(missing).toEqual([]);
  });
});
