import { describe, expect, it } from 'vitest';
import { normaliseFiscalCode, readFiscalCode } from './fiscal-code';

/**
 * The client's reading of a codice fiscale (#1934), for pre-filling the form.
 * The server is the one that validates; these are the same synthetic codes
 * its tests use, built from the published algorithm.
 */
describe('readFiscalCode', () => {
  const today = new Date(2026, 8, 27);

  it('reads the date of birth and the sex', () => {
    expect(readFiscalCode('RSSMRA90C15H501O', today)).toEqual({
      dateOfBirth: new Date(1990, 2, 15),
      sex: 'm',
    });
    // A woman's day is written +40: 52 is the 12th.
    expect(readFiscalCode('BNCGLI15H52F205N', today)).toEqual({
      dateOfBirth: new Date(2015, 5, 12),
      sex: 'f',
    });
  });

  it('accepts the textbook example, a foreign-born code and an omocodic one', () => {
    expect(readFiscalCode('RSSMRA80A01H501U', today)).not.toBeNull();
    expect(readFiscalCode('SMTJHN85A01Z404P', today)).not.toBeNull();
    expect(readFiscalCode('RSSMRAVLCMRHRLMS', today)?.dateOfBirth).toEqual(new Date(1990, 2, 15));
  });

  it('reads nothing from a code that is not valid', () => {
    expect(readFiscalCode('RSSMRA90C15H501A', today)).toBeNull(); // wrong check character
    expect(readFiscalCode('RSSMRA90C15H501', today)).toBeNull(); // too short
    expect(readFiscalCode('RSSMRA90B31H501Y', today)).toBeNull(); // 31 February
    expect(readFiscalCode('', today)).toBeNull();
  });

  it('reads a code typed in lower case or with spaces', () => {
    expect(normaliseFiscalCode(' rssmra 90c15 h501o ')).toBe('RSSMRA90C15H501O');
    expect(readFiscalCode('rssmra90c15h501o', today)?.sex).toBe('m');
  });
});
