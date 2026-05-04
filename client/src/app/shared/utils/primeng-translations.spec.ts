import { primeNgTranslationFor } from './primeng-translations';

describe('primeNgTranslationFor (#280)', () => {
  it('returns 12 month names + 12 short month names per supported language', () => {
    for (const lang of ['en', 'it'] as const) {
      const t = primeNgTranslationFor(lang);
      expect(t.monthNames?.length, `monthNames length for ${lang}`).toBe(12);
      expect(t.monthNamesShort?.length, `monthNamesShort length for ${lang}`).toBe(12);
    }
  });

  it('returns 7 day names + short + min entries per supported language', () => {
    for (const lang of ['en', 'it'] as const) {
      const t = primeNgTranslationFor(lang);
      expect(t.dayNames?.length).toBe(7);
      expect(t.dayNamesShort?.length).toBe(7);
      expect(t.dayNamesMin?.length).toBe(7);
    }
  });

  it('pins Monday as the first day of the week for both EN and IT', () => {
    // EU convention regardless of UI language. PrimeNG's default is
    // Sunday (US-first); a regression here would silently put Sunday
    // back on the calendar's left edge for both audiences.
    expect(primeNgTranslationFor('en').firstDayOfWeek).toBe(1);
    expect(primeNgTranslationFor('it').firstDayOfWeek).toBe(1);
  });

  it('returns Italian month / day labels for "it"', () => {
    const t = primeNgTranslationFor('it');
    expect(t.monthNames).toContain('Maggio');
    expect(t.monthNamesShort).toContain('Mag');
    expect(t.dayNames).toContain('lunedì');
    expect(t.today).toBe('Oggi');
    expect(t.clear).toBe('Cancella');
  });

  it('returns English labels for "en"', () => {
    const t = primeNgTranslationFor('en');
    expect(t.monthNames).toContain('May');
    expect(t.dayNames).toContain('Monday');
    expect(t.today).toBe('Today');
  });
});
