/**
 * Where closing the athlete's edit form puts you back (#1633).
 *
 * The form has three exits and they must agree: the header's own button, and
 * `Annulla` / `Salva modifiche` at the bottom of the form itself. The header
 * knows which section the form was opened from; the form does not, and cannot
 * read a signal that lives in its parent — so the section travels in the URL
 * as `?from=`, and both sides resolve it through this one function.
 *
 * The value is read straight off a URL, so it is checked against the sections
 * that actually exist rather than handed to the router as-is. `?from=edit`
 * would otherwise reopen the form the user just closed, and `?from=anything`
 * would navigate to a route that does not resolve.
 */
const SECTIONS: readonly string[] = [
  'documents',
  'attendance',
  'payments',
  'coverage',
  'promotions',
];

/** Documenti is the fallback: it is the detail page's default child route. */
export function returnSection(from: string | null | undefined): string {
  return from != null && SECTIONS.includes(from) ? from : 'documents';
}
