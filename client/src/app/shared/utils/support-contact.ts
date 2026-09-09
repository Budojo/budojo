import { VERSION } from '../../../environments/version';

/**
 * Where a message actually reaches a person (#1476).
 *
 * One constant, because the landing page's footer already hardcoded this
 * address and a second copy is a second thing to forget when it changes.
 */
export const SUPPORT_EMAIL = 'matteo.bonanno@budojo.it';

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
  const body = [`Version: ${VERSION.tag}`, `Build: ${profile}`, `System: ${platform}`, '', ''].join(
    '\n',
  );

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
