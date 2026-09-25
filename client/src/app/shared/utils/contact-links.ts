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
 * `phone_national_number` as its **national significant number**, which the
 * server stores on every write since #1867 — a trunk zero typed on the form
 * (`+44` + `07911123456`) is dropped, and an Italian landline's leading zero
 * is kept. A one-off migration dropped the trunk zeros already stored. So the
 * pair is E.164, and this function only has to strip the `+` and anything
 * that is not a digit. It does not re-derive the number itself: that rule is
 * libphonenumber's, on the server. (An Italian landline imported before #1867
 * may lack its zero and give a link that does not ring; the server logged
 * those rows for a person to fix rather than guess the zero back.)
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

/**
 * A WhatsApp link that carries a message and no number (#1863): WhatsApp
 * asks which chat to send it to, which is how a message reaches the
 * academy's group — the one place every athlete already reads. Opened with
 * `target="_blank"`, like `contactLinks`' own `wa.me`.
 */
export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
