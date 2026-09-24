/**
 * The two ways to reach someone from a phone number we hold (#1727).
 *
 * `tel:` for a call, and a `wa.me` link for WhatsApp — which is how this
 * owner actually contacts people, and on the desktop build (no mail server)
 * the only delivery mechanism the product has for anything it wants to say
 * to an athlete. Both are `null` together unless BOTH halves of the pair are
 * present: a half-populated pair produces no link, never a broken one.
 */
export interface ContactLinks {
  tel: string | null;
  whatsapp: string | null;
}

/** Digits only — the country code is stored with its `+`, and people type spaces. */
function digitsOf(part: string | null | undefined): string {
  return (part ?? '').replace(/\D/g, '');
}

/**
 * Built from the stored pair: `phone_country_code` with its `+`, and
 * `phone_national_number` **as the owner typed it**. That is not guaranteed to
 * be E.164: a national trunk prefix survives validation (`+44` +
 * `07911123456`), and this function strips only non-digits, so wa.me then gets
 * `4407911123456`, which WhatsApp rejects. The fix belongs in how the number
 * is stored, not here (#1867).
 *
 * - `tel:+393331234567` — unspaced, because the scheme does not tolerate
 *   inner whitespace, and with the `+`, because without it the number would
 *   be dialled as a local one.
 * - `https://wa.me/393331234567` — WITHOUT the `+`: `wa.me/+39…` is not a
 *   valid path.
 *
 * `tel:` never takes a `target`: it goes to the operating system, and a blank
 * tab for it leaves an empty window. `wa.me` always takes `target="_blank"`:
 * it is a web page and must not replace the app, and the desktop shell hands
 * a new `https` window to the system browser.
 */
export function contactLinks(
  countryCode: string | null | undefined,
  nationalNumber: string | null | undefined,
): ContactLinks {
  const cc = digitsOf(countryCode);
  const nn = digitsOf(nationalNumber);
  if (cc === '' || nn === '') return { tel: null, whatsapp: null };

  return { tel: `tel:+${cc}${nn}`, whatsapp: `https://wa.me/${cc}${nn}` };
}

/**
 * The number as a person reads it — the prefix apart from the digits
 * (`+39 3331234567`). Same all-or-nothing rule as `contactLinks`.
 */
export function phoneLabel(
  countryCode: string | null | undefined,
  nationalNumber: string | null | undefined,
): string | null {
  if (digitsOf(countryCode) === '' || digitsOf(nationalNumber) === '') return null;

  return `${(countryCode ?? '').trim()} ${(nationalNumber ?? '').trim()}`;
}
