import { contactLinks, phoneLabel, whatsappMessageLink, whatsappShareLink } from './contact-links';

/**
 * One place that turns the stored phone pair into something you can press
 * (#1727). It used to be built inline three times, each with its own null
 * check, and none of them offered WhatsApp — which is how this owner actually
 * reaches people.
 */
describe('contactLinks', () => {
  it('builds the unspaced tel: and the wa.me link from the E.164 pair', () => {
    expect(contactLinks('+39', '3331234567')).toEqual({
      tel: 'tel:+393331234567',
      whatsapp: 'https://wa.me/393331234567',
    });
  });

  it('strips the + from the WhatsApp path, which tel: keeps', () => {
    // `wa.me/+39…` is not a valid path; `wa.me/39…` is. The two formats
    // genuinely differ, so this is the assertion that goes red if the strip
    // is reverted while tel: stays green.
    const { tel, whatsapp } = contactLinks('+39', '3331234567');

    expect(whatsapp).not.toContain('+');
    expect(tel).toContain('+39');
  });

  it.each([
    ['39', '3331234567'],
    [' +39 ', '333 123 4567'],
    ['+39', '333-123-4567'],
  ])('reads %j + %j as the same number', (cc, nn) => {
    expect(contactLinks(cc, nn)).toEqual({
      tel: 'tel:+393331234567',
      whatsapp: 'https://wa.me/393331234567',
    });
  });

  it.each([
    ['+39', null],
    [null, '3331234567'],
    ['+39', ''],
    ['', '3331234567'],
    [undefined, undefined],
    ['+', '3331234567'],
  ])('offers nothing for a half pair (%j, %j), not a broken link', (cc, nn) => {
    expect(contactLinks(cc, nn)).toEqual({ tel: null, whatsapp: null });
  });
});

describe('phoneLabel', () => {
  it('keeps the prefix apart from the digits, so the number can be read', () => {
    expect(phoneLabel('+39', '3331234567')).toBe('+39 3331234567');
  });

  it('is null for a half pair', () => {
    expect(phoneLabel('+39', null)).toBeNull();
    expect(phoneLabel(null, '3331234567')).toBeNull();
  });
});

describe('whatsappShareLink (#1863)', () => {
  it('carries the message and no number, so WhatsApp asks which chat', () => {
    const text = 'Programma della settimana\nLun 12 · Fondamentali · Half guard';
    const link = whatsappShareLink(text);

    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.slice('https://wa.me/?text='.length))).toBe(text);
  });

  it('encodes what would otherwise end the text early or break the link', () => {
    expect(whatsappShareLink('Back & side: 50% #1 ?')).toBe(
      'https://wa.me/?text=Back%20%26%20side%3A%2050%25%20%231%20%3F',
    );
  });
});

describe('whatsappMessageLink (#1931)', () => {
  it("opens that person's chat with the message already written", () => {
    expect(whatsappMessageLink('+39', '3331234567', 'Ciao Andrea')).toBe(
      'https://wa.me/393331234567?text=Ciao%20Andrea',
    );
  });

  it('strips the + and the spaces people type, as the plain link does', () => {
    expect(whatsappMessageLink('+44', '7911 123456', 'Hi')).toBe(
      'https://wa.me/447911123456?text=Hi',
    );
  });

  it('encodes the amount, the dash and the accents, which a raw URL would break on', () => {
    const text = 'quota di settembre (70,00 €) — Budojo & co?';
    const link = whatsappMessageLink('+39', '3331234567', text);

    expect(link).not.toContain(' ');
    expect(decodeURIComponent((link ?? '').split('?text=')[1] ?? '')).toBe(text);
  });

  it('is null for a half pair, never a link to nobody', () => {
    expect(whatsappMessageLink('+39', null, 'Ciao')).toBeNull();
    expect(whatsappMessageLink(null, '3331234567', 'Ciao')).toBeNull();
    expect(whatsappMessageLink('', '', 'Ciao')).toBeNull();
  });
});
