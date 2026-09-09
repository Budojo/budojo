import { VERSION } from '../../../environments/version';

/**
 * Where a message actually reaches a person (#1476).
 *
 * One constant. The landing page's footer hardcoded this address before
 * there was one; it reads it from here now, so the address lives in a single
 * place on the client side. (`SubmitSupportTicketAction` has the server's own
 * copy, which is a different runtime and deliberately separate.)
 */
export const SUPPORT_EMAIL = 'matteobonanno1990@gmail.com';

/**
 * A `mailto:` for the builds that have no way to send a ticket.
 *
 * The in-app form posts to the API, which queues an email — and the desktop
 * profile has no `email` capability, so on the shipped build it accepted the
 * message, wrote a row to the local database and told the user it was sent
 * (#1464 hid it for that reason). The user's own mail client has none of that
 * problem: it needs no server, it queues offline and sends when the network
 * comes back, and the reply lands somewhere they already read.
 *
 * The diagnostics the form used to attach automatically are put in the body
 * instead, above a blank line, so the person writing does not have to know
 * their build number and can delete the block if they would rather not send
 * it. That last part is the reason it is visible text rather than a hidden
 * header: attaching what someone can see is a different thing from attaching
 * what they cannot.
 */
export function supportMailtoHref(
  profile: 'web' | 'desktop',
  platform = navigator.userAgent,
): string {
  const subject = `Budojo — ${VERSION.tag}`;
  // CRLF, not LF. RFC 6068 §5 specifies `%0D%0A` for a mailto body, and
  // Outlook — the likely default client on the Windows-only shipped build —
  // collapses a bare `%0A`, which would run the three diagnostic lines
  // together exactly where being able to read them is the point.
  const body = [`Version: ${VERSION.tag}`, `Build: ${profile}`, `System: ${platform}`, '', ''].join(
    '\r\n',
  );

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
