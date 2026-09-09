import { SUPPORT_EMAIL, supportMailtoHref } from './support-contact';

/**
 * The href is a URL that a mail client parses, so these assert the RAW string
 * — not a `decodeURIComponent()` of it. Decoding first is the mistake that
 * makes an encoding test pass for code that never encoded anything.
 */
describe('supportMailtoHref (#1476)', () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 & Electron/44 #build';

  it('addresses the one constant the app holds', () => {
    expect(supportMailtoHref('desktop', UA)).toContain(`mailto:${SUPPORT_EMAIL}?`);
  });

  it('percent-encodes the characters that would otherwise end the URL', () => {
    const href = supportMailtoHref('desktop', UA);

    // A raw `&` starts the next query parameter and a raw `#` starts the
    // fragment, so an unencoded user agent truncates the body at the first
    // one — silently, and only for the people whose browser puts one there.
    expect(href).not.toContain('& Electron');
    expect(href).not.toContain('#build');
    expect(href).toContain('%26');
    expect(href).toContain('%23');
  });

  it('breaks the body lines with CRLF, which is what a mail client reads', () => {
    // RFC 6068 §5. Outlook — the likely default client on the Windows-only
    // shipped build — collapses a bare `%0A`, which would run the three
    // diagnostic lines into one exactly where reading them is the point.
    const href = supportMailtoHref('desktop', UA);

    expect(href).toContain('%0D%0A');
    expect(href).not.toMatch(/%0A(?<!%0D%0A)/);
  });

  it('names the build, so the first reply is not a question about it', () => {
    expect(decodeURIComponent(supportMailtoHref('desktop', UA))).toContain('Build: desktop');
    expect(decodeURIComponent(supportMailtoHref('web', UA))).toContain('Build: web');
  });

  it('carries the version in both the subject and the body', () => {
    // The subject so it is visible before sending; the body so it survives a
    // reply chain where the subject gets rewritten.
    const href = decodeURIComponent(supportMailtoHref('desktop', UA));

    expect(href).toContain('subject=Budojo — ');
    expect(href).toContain('Version: ');
  });

  it('ends the diagnostics with a blank line for the person to write in', () => {
    // Nobody should have to move the cursor past a block of build numbers to
    // start their sentence.
    expect(decodeURIComponent(supportMailtoHref('desktop', UA))).toMatch(/System: .+\r\n\r\n$/);
  });

  it('falls back to the browser it is running in', () => {
    // The default argument. Asserted against navigator rather than against a
    // literal, so it does not encode jsdom's user agent into the expectation.
    expect(decodeURIComponent(supportMailtoHref('web'))).toContain(
      `System: ${navigator.userAgent}`,
    );
  });
});
