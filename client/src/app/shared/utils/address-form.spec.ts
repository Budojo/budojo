import { FormControl, FormGroup } from '@angular/forms';
import {
  COUNTRY_OPTIONS,
  PROVINCE_CODES,
  PROVINCE_OPTIONS,
  addressAllOrNothing,
  italianPostalCode,
} from './address-form';

describe('PROVINCE_CODES', () => {
  it('lists 107 ISO 3166-2:IT province codes — matches the backend ItalianProvince enum', () => {
    expect(PROVINCE_CODES).toHaveLength(107);
  });

  it('includes the SU case (Sud Sardegna) that replaces the four abolished Sardinian provinces', () => {
    expect(PROVINCE_CODES).toContain('SU');
  });

  it('includes the major metro province codes', () => {
    for (const code of ['RM', 'MI', 'TO', 'NA', 'BO', 'FI']) {
      expect(PROVINCE_CODES).toContain(code);
    }
  });

  it('contains no duplicates', () => {
    expect(new Set(PROVINCE_CODES).size).toBe(PROVINCE_CODES.length);
  });
});

describe('PROVINCE_OPTIONS', () => {
  it('produces one option per code with label === value', () => {
    expect(PROVINCE_OPTIONS).toHaveLength(PROVINCE_CODES.length);
    for (const option of PROVINCE_OPTIONS) {
      expect(option.label).toBe(option.value);
    }
  });
});

describe('COUNTRY_OPTIONS', () => {
  it('exposes only Italy in MVP — adding a country is a deliberate code change', () => {
    expect(COUNTRY_OPTIONS).toEqual([{ label: 'Italy', value: 'IT' }]);
  });
});

describe('addressAllOrNothing', () => {
  type AddressFieldKey = 'line1' | 'line2' | 'city' | 'postal_code' | 'province';

  function makeAddressGroup(values: Partial<Record<AddressFieldKey, string>> = {}): FormGroup {
    return new FormGroup({
      line1: new FormControl(values.line1 ?? ''),
      line2: new FormControl(values.line2 ?? ''),
      city: new FormControl(values.city ?? ''),
      postal_code: new FormControl(values.postal_code ?? ''),
      province: new FormControl(values.province ?? ''),
    });
  }

  it('returns null when the entire address is empty (legitimate "no address" state)', () => {
    expect(addressAllOrNothing(makeAddressGroup())).toBeNull();
  });

  it('returns null when all four required fields are filled', () => {
    expect(
      addressAllOrNothing(
        makeAddressGroup({
          line1: 'Via Roma 1',
          city: 'Roma',
          postal_code: '00100',
          province: 'RM',
        }),
      ),
    ).toBeNull();
  });

  it('flags addressIncomplete when only one required field is filled', () => {
    expect(addressAllOrNothing(makeAddressGroup({ city: 'Roma' }))).toEqual({
      addressIncomplete: true,
    });
  });

  it('flags addressIncomplete when three of four required fields are filled', () => {
    expect(
      addressAllOrNothing(
        makeAddressGroup({
          line1: 'Via Roma 1',
          city: 'Roma',
          postal_code: '00100',
        }),
      ),
    ).toEqual({ addressIncomplete: true });
  });

  it('treats whitespace-only values as empty', () => {
    expect(addressAllOrNothing(makeAddressGroup({ city: '   ' }))).toBeNull();
  });

  it('ignores line2 — it is optional and never required with the others', () => {
    expect(
      addressAllOrNothing(
        makeAddressGroup({
          line1: 'Via Roma 1',
          city: 'Roma',
          postal_code: '00100',
          province: 'RM',
          // line2 deliberately empty
        }),
      ),
    ).toBeNull();
  });

  it('returns null when given a non-FormGroup control (defensive early-exit)', () => {
    const standaloneControl = new FormControl('Via Roma 1');
    expect(addressAllOrNothing(standaloneControl)).toBeNull();
  });
});

describe('italianPostalCode', () => {
  it('accepts an empty value (the field is optional at the field level — the group validator owns required-when-filled)', () => {
    expect(italianPostalCode(new FormControl(''))).toBeNull();
    expect(italianPostalCode(new FormControl(null))).toBeNull();
  });

  it('accepts a 5-digit CAP', () => {
    expect(italianPostalCode(new FormControl('00100'))).toBeNull();
    expect(italianPostalCode(new FormControl('20121'))).toBeNull();
  });

  it('rejects a 4-digit value', () => {
    expect(italianPostalCode(new FormControl('1234'))).toEqual({ pattern: true });
  });

  it('rejects a 6-digit value', () => {
    expect(italianPostalCode(new FormControl('123456'))).toEqual({ pattern: true });
  });

  it('rejects a value containing non-digits', () => {
    expect(italianPostalCode(new FormControl('00A00'))).toEqual({ pattern: true });
    expect(italianPostalCode(new FormControl('00-100'))).toEqual({ pattern: true });
  });
});
