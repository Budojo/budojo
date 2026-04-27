import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { CountryCode, ItalianProvinceCode } from '../../core/services/academy.service';

interface SelectOption<T extends string> {
  label: string;
  value: T;
}

/**
 * ISO 3166-2:IT province codes (#72) — kept in lock-step with the backend
 * `App\Enums\ItalianProvince` enum. Shared between every form that asks
 * for an address (academy #72a, athlete #72b, future instructors / event
 * venues) so adding a code is a one-file change.
 */
export const PROVINCE_CODES: ItalianProvinceCode[] = [
  'AG',
  'AL',
  'AN',
  'AO',
  'AP',
  'AQ',
  'AR',
  'AT',
  'AV',
  'BA',
  'BG',
  'BI',
  'BL',
  'BN',
  'BO',
  'BR',
  'BS',
  'BT',
  'BZ',
  'CA',
  'CB',
  'CE',
  'CH',
  'CL',
  'CN',
  'CO',
  'CR',
  'CS',
  'CT',
  'CZ',
  'EN',
  'FC',
  'FE',
  'FG',
  'FI',
  'FM',
  'FR',
  'GE',
  'GO',
  'GR',
  'IM',
  'IS',
  'KR',
  'LC',
  'LE',
  'LI',
  'LO',
  'LT',
  'LU',
  'MB',
  'MC',
  'ME',
  'MI',
  'MN',
  'MO',
  'MS',
  'MT',
  'NA',
  'NO',
  'NU',
  'OR',
  'PA',
  'PC',
  'PD',
  'PE',
  'PG',
  'PI',
  'PN',
  'PO',
  'PR',
  'PT',
  'PU',
  'PV',
  'PZ',
  'RA',
  'RC',
  'RE',
  'RG',
  'RI',
  'RM',
  'RN',
  'RO',
  'SA',
  'SI',
  'SO',
  'SP',
  'SR',
  'SS',
  'SU',
  'SV',
  'TA',
  'TE',
  'TN',
  'TO',
  'TP',
  'TR',
  'TS',
  'TV',
  'UD',
  'VA',
  'VB',
  'VC',
  'VE',
  'VI',
  'VR',
  'VT',
  'VV',
];

export const PROVINCE_OPTIONS: SelectOption<ItalianProvinceCode>[] = PROVINCE_CODES.map((code) => ({
  label: code,
  value: code,
}));

export const COUNTRY_OPTIONS: SelectOption<CountryCode>[] = [{ label: 'Italy', value: 'IT' }];

/**
 * Cross-field "all-or-nothing" validator (#72) for the address `FormGroup`:
 * if any of the four required fields (line1, city, postal_code, province)
 * is filled, all of them must be filled. The user can leave the entire
 * address empty (the owner then has no address on file) but can't submit
 * a half-baked one that the backend's `required_with` rules would reject
 * anyway. Mirrors the server-side rule one-for-one.
 */
export const addressAllOrNothing: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  if (!(group instanceof FormGroup)) return null;
  const requiredKeys = ['line1', 'city', 'postal_code', 'province'] as const;
  const values = requiredKeys.map((k) => (group.get(k)?.value ?? '').toString().trim());
  const filled = values.filter((v) => v !== '').length;
  if (filled === 0 || filled === requiredKeys.length) return null;
  return { addressIncomplete: true };
};

/**
 * Five-digit Italian CAP. Same regex the backend enforces; client-side
 * mirrors it so the error surfaces inline before round-tripping.
 */
export const italianPostalCode: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = (control.value ?? '').toString();
  if (value === '') return null; // optional at the field level — the group validator owns required-when-filled
  return /^\d{5}$/.test(value) ? null : { pattern: true };
};
