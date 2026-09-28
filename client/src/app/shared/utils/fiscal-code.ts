import type { Sex } from '../../core/services/athlete.service';

/**
 * What a codice fiscale says about its holder (#1934), read on the client
 * only to pre-fill an empty date of birth and sex on the athlete form. The
 * server is the one that validates (`App\Support\FiscalCode`); this is the
 * same published algorithm (DM 23/12/1976), omocodia included.
 */
export interface FiscalCodeReading {
  readonly dateOfBirth: Date;
  readonly sex: Sex;
}

const SHAPE =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
const MONTHS = 'ABCDEHLMPRST';
const OMOCODIA = 'LMNPQRSTUV';
/** A character's value in an odd position (1st, 3rd, …), digits then letters. */
const ODD_DIGITS = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21];
const ODD_LETTERS = [
  1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23,
];

/** Capitals and no spaces: the way the server stores it. */
export function normaliseFiscalCode(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase();
}

export function readFiscalCode(text: string, today: Date): FiscalCodeReading | null {
  const code = normaliseFiscalCode(text);
  if (!SHAPE.test(code) || checkCharacter(code.slice(0, 15)) !== code[15]) return null;

  const yearInCentury = Number(digits(code.slice(6, 8)));
  const month = MONTHS.indexOf(code[8]);
  const encodedDay = Number(digits(code.slice(9, 11)));
  const sex: Sex = encodedDay > 40 ? 'f' : 'm';
  const day = encodedDay > 40 ? encodedDay - 40 : encodedDay;

  // The latest century that does not put the birth in the future, as the
  // server reads it.
  let dateOfBirth = new Date(2000 + yearInCentury, month, day);
  if (dateOfBirth > today) dateOfBirth = new Date(1900 + yearInCentury, month, day);
  if (dateOfBirth.getMonth() !== month || dateOfBirth.getDate() !== day) return null;

  return { dateOfBirth, sex };
}

function checkCharacter(first15: string): string {
  let sum = 0;
  for (let i = 0; i < first15.length; i++) {
    const char = first15[i];
    const isDigit = char >= '0' && char <= '9';
    const index = isDigit ? Number(char) : char.charCodeAt(0) - 65;
    sum += i % 2 === 0 ? (isDigit ? ODD_DIGITS[index] : ODD_LETTERS[index]) : index;
  }
  return String.fromCharCode(65 + (sum % 26));
}

/** Undo omocodia: L→0 … V→9. */
function digits(chars: string): string {
  return [...chars].map((c) => (OMOCODIA.includes(c) ? String(OMOCODIA.indexOf(c)) : c)).join('');
}
