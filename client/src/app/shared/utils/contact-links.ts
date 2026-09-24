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
 * Built from the stored E.164 pair (`phone_country_code` with its `+`,
 * `phone_national_number`).
 *
 * - `tel:+393331234567` — unspaced, because the scheme does not tolerate
 *   inner whitespace, and with the `+`, because without it the number would
 *   be dialled as a local one.
 * - `https://wa.me/393331234567` — WITHOUT the `+`: `wa.me/+39…` is not a
 *   valid path.
 *
 * Neither is meant for `target="_blank"` on its own terms — see the callers:
 * `tel:` goes to the operating system, `wa.me` to the browser.
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
