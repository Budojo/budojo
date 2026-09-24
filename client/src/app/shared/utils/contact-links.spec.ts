import { contactLinks, phoneLabel } from './contact-links';

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
