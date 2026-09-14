import IT from '../../../../public/assets/i18n/it.json';

/**
 * One word per thing, in the language the app ships first (#1647).
 *
 * The Italian UI called a stripe three things at once: "striscette" in the
 * promotion rows and the dialog, "strisce" on the belt badge, and "Gradi" on
 * the form that actually sets them. A reader moving between the roster, an
 * athlete's promotions and the edit form met a different word each time, for
 * the same number on the same belt.
 *
 * "Gradi" wins because it is what the control that writes the value says.
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

describe('one Italian word per thing (#1647)', () => {
  const flat = flatten(IT as unknown as Bundle);

  it('calls a stripe a grado, and never a striscia or a striscetta', () => {
    const offenders = Object.entries(flat)
      .filter(([, v]) => /strisc/i.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    expect(offenders).toEqual([]);
  });

  it('calls a technique a tecnica, not a thing', () => {
    // "3 su 6 cose che la palestra ha fatto" — they are techniques, and the
    // page is the one that counts them.
    expect(flat['athletes.coverage.fraction']).toContain('tecniche');
    expect(flat['athletes.coverage.fraction']).not.toContain('cose');
  });

  it('says what the athlete missed without agreeing with their gender', () => {
    // "Cosa si è perso" genders the reader; "Cosa ha perso" does not.
    expect(flat['athletes.coverage.missed.title']).toBe('Cosa ha perso');
  });
});
