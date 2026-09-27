import { SupportedLanguage } from '../../core/services/language.service';
import { localeFor } from './locale';

/**
 * Money, written as money (#1549).
 *
 * The revenue chart drew bare floats — hovering a bar gave `17.61`, and the
 * owner's question was the right one: seventeen WHAT? `Intl` rather than a
 * hand-rolled `€` prefix, because the symbol's side and the decimal separator
 * both move with the language: Italian writes `17,61 €` where English writes
 * `€17.61`.
 *
 * One formatter for every amount on a screen (#1759): the chart, the month's
 * tiles and the arrears list sit a few centimetres apart, and two formatters
 * are how the same sum ends up written two ways on one page.
 */
export function formatMoney(amount: number, currency: string, lang: SupportedLanguage): string {
  return amount.toLocaleString(localeFor(lang), { style: 'currency', currency });
}

/** The same, from the cents the API sends. */
export function formatCents(cents: number, currency: string, lang: SupportedLanguage): string {
  return formatMoney(cents / 100, currency, lang);
}
