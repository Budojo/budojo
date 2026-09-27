import { formatCents, formatMoney } from './money';

/**
 * Money, written as money (#1549), in one place (#1759).
 *
 * The revenue chart, the arrears list and the month's tiles all print
 * amounts; a second formatter is how "€17.61" on the chart and "17,61 €" on
 * a tile end up on the same screen in the same language.
 */
describe('formatMoney / formatCents', () => {
  it('writes the symbol and the separators the language uses', () => {
    expect(formatMoney(2560, 'EUR', 'en')).toBe('€2,560.00');

    // Italian: symbol last, comma for the decimals. Asserted as properties,
    // not one string — the thousands separator is the ICU build's call
    // (`it-IT` omits it below ten thousand), not this helper's.
    const italian = formatMoney(2560, 'EUR', 'it');
    expect(italian.endsWith('€')).toBe(true);
    expect(italian).toContain(',00');
    expect(italian.startsWith('€')).toBe(false);
  });

  it('takes cents as the API sends them', () => {
    expect(formatCents(1761, 'EUR', 'en')).toBe('€17.61');
  });
});
