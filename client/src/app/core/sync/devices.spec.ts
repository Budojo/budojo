import {
  confirmedThrough,
  DeviceReport,
  parseDeviceReport,
  serializeDeviceReport,
  unreadableReport,
} from './devices';

/**
 * When a write may leave a journal (#2029): only once every other device
 * reports holding it. No clock is involved, so an upload that lands days late
 * cannot beat the rule.
 */
const PC = 'pc4f2a';
const PHONE = 'phone9c1e';
const TABLET = 'tabletq7w2';
const report = (device: string, holds: Record<string, string>): DeviceReport => ({
  device,
  base: { seq: 44, device: PC },
  holds,
  at: '2026-10-01T18:00:00Z',
});

describe('confirmedThrough (#2029)', () => {
  it('is the newest of its entries the other device holds', () => {
    const reports = [report(PC, {}), report(PHONE, { [PC]: '01K6F3Q8Z4M7X2N5P9R1T3V6W8' })];

    expect(confirmedThrough(PC, reports)).toBe('01K6F3Q8Z4M7X2N5P9R1T3V6W8');
  });

  it('with several other devices, is the oldest of what they hold: all of them must hold it', () => {
    const reports = [
      report(PHONE, { [PC]: '01K6F3R2A9B8C7D6E5F4G3H2J1' }),
      report(TABLET, { [PC]: '01K6F3Q8Z4M7X2N5P9R1T3V6W8' }),
    ];

    expect(confirmedThrough(PC, reports)).toBe('01K6F3Q8Z4M7X2N5P9R1T3V6W8');
  });

  it('is nothing while another device holds none of its entries yet', () => {
    const reports = [
      report(PHONE, { [PC]: '01K6F3R2A9B8C7D6E5F4G3H2J1' }),
      report(TABLET, { [PHONE]: '01K6F3R2A9B8C7D6E5F4G3H2J1' }),
    ];

    expect(confirmedThrough(PC, reports)).toBeNull();
  });

  it('is nothing while a newly paired device has written its first, empty report', () => {
    const reports = [report(PC, {}), { ...report(PHONE, {}), base: null }];

    expect(confirmedThrough(PC, reports)).toBeNull();
  });

  it('is nothing while another device’s report cannot be read', () => {
    expect(confirmedThrough(PC, [report(PC, {}), unreadableReport(PHONE)])).toBeNull();
  });

  it('is everything when no other device reports: nobody to race, and a new one starts from the latest', () => {
    expect(confirmedThrough(PC, [report(PC, {})])).toBe('everything');
    expect(confirmedThrough(PC, [])).toBe('everything');
  });
});

describe('device reports (#2029)', () => {
  const phone = report(PHONE, { [PC]: '01K6F3Q8Z4M7X2N5P9R1T3V6W8' });

  it('round-trip through JSON', () => {
    expect(parseDeviceReport(JSON.parse(JSON.stringify(serializeDeviceReport(phone))))).toEqual({
      ok: true,
      value: phone,
    });
  });

  it('take a device that has not synced yet', () => {
    expect(parseDeviceReport(serializeDeviceReport({ ...phone, base: null })).ok).toBe(true);
  });

  const malformed: [string, Record<string, unknown>, string][] = [
    ['another version', { ...serializeDeviceReport(phone), v: 2 }, 'version 2'],
    ['a device that is not one', { ...serializeDeviceReport(phone), device: 'PC' }, 'device'],
    ['a base that is not a version', { ...serializeDeviceReport(phone), base: 44 }, 'base'],
    [
      'a holding that is not a ULID',
      { ...serializeDeviceReport(phone), holds: { [PC]: 'yesterday' } },
      'ULID',
    ],
    ['a local time', { ...serializeDeviceReport(phone), at: '2026-10-01T20:00:00+02:00' }, 'UTC'],
  ];
  for (const [name, value, reason] of malformed) {
    it(`refuse ${name}, and say so`, () => {
      const parsed = parseDeviceReport(value);

      expect(parsed.ok).toBe(false);
      expect(parsed.ok ? '' : parsed.reason).toContain(reason);
    });
  }
});
