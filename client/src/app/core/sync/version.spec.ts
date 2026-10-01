import { concat, toHex, utf8 } from './bytes';
import { JournalEntry, parseJournal, parseJournalEntry } from './journal';
import { packVersion, parseManifest, PROTOCOL, unpackVersion, VersionManifest } from './version';

/** A check-in and a payment from the phone at the gym: what a journal holds. */
const checkIn: JournalEntry = {
  id: '01K6F3Q8Z4M7X2N5P9R1T3V6W8',
  device: 'phone9c1e',
  at: '2026-10-01T18:32:05.123456Z',
  method: 'POST',
  route: 'attendance.store',
  params: {},
  body: { date: '2026-10-01', athlete_ids: [57] },
  created: { attendance_records: [912] },
  before: null,
};

const payment: JournalEntry = {
  id: '01K6F3R2A9B8C7D6E5F4G3H2J1',
  device: 'phone9c1e',
  at: '2026-10-01T18:40:00.000000Z',
  method: 'PUT',
  route: 'athletes.payments.update',
  params: { athlete: 57, payment: 300 },
  body: { amount_cents: 5000 },
  created: {},
  before: { amount_cents: 4500 },
};

const manifest: Omit<VersionManifest, 'journalSha256'> = {
  protocol: PROTOCOL,
  seq: 44,
  parent: { seq: 43, device: 'pc4f2a' },
  device: 'phone9c1e',
  schema: '2026_09_28_120000_add_payment_method_to_athlete_payments',
  app: '2.75.0',
  createdAt: '2026-10-01T18:45:00.000Z',
};

describe('journal entries (#2029)', () => {
  it('round-trip through JSON', () => {
    for (const entry of [checkIn, payment]) {
      expect(parseJournalEntry(JSON.parse(JSON.stringify(entry)))).toEqual({
        ok: true,
        value: entry,
      });
    }
  });

  const malformed: [string, Record<string, unknown>, string][] = [
    ['no device', { ...checkIn, device: undefined }, 'device'],
    ['an id that is not a ULID', { ...checkIn, id: 'abc' }, 'ULID'],
    ['a local time, not UTC', { ...checkIn, at: '2026-10-01T20:32:05+02:00' }, 'UTC'],
    ['a read', { ...checkIn, method: 'GET' }, 'not a write'],
    ['a URL for a route', { ...checkIn, route: '/api/v1/attendance' }, 'route name'],
    ['a time on a day that does not exist', { ...checkIn, at: '2026-02-30T18:00:00Z' }, 'UTC'],
    [
      'a parameter that is an object',
      { ...checkIn, params: { athlete: { id: 57 } } },
      'parameters',
    ],
    ['a body that is a list', { ...checkIn, body: [57] }, 'body'],
    [
      'a created id that is not a positive integer',
      { ...checkIn, created: { athletes: [0] } },
      'created',
    ],
    ['a before that is a string', { ...payment, before: '4500' }, 'before'],
  ];
  for (const [name, entry, reason] of malformed) {
    it(`refuses ${name}, and says so`, () => {
      const parsed = parseJournalEntry(JSON.parse(JSON.stringify(entry)));

      expect(parsed.ok).toBe(false);
      expect(parsed.ok ? '' : parsed.reason).toContain(reason);
    });
  }

  it('takes a route name with a hyphen, as Laravel names fee-tiers.store', () => {
    expect(parseJournalEntry({ ...checkIn, route: 'fee-tiers.store' }).ok).toBe(true);
  });

  it('refuses a journal out of order, naming the entry', () => {
    expect(parseJournal([payment, checkIn])).toEqual({
      ok: false,
      reason: 'entry 2: out of order',
    });
  });

  it('names the first bad entry by its position', () => {
    expect(parseJournal([checkIn, { ...payment, method: 'GET' }])).toEqual({
      ok: false,
      reason: 'entry 2: the method is not a write',
    });
  });
});

describe('manifests (#2029)', () => {
  const complete: VersionManifest = { ...manifest, journalSha256: 'a'.repeat(64) };

  it('round-trips through JSON', () => {
    expect(parseManifest(JSON.parse(JSON.stringify(complete)))).toEqual({
      ok: true,
      value: complete,
    });
  });

  it('reads past a field a later app added to the same protocol, and drops it', () => {
    expect(parseManifest({ ...complete, photos: 12 })).toEqual({ ok: true, value: complete });
  });

  const malformed: [string, Record<string, unknown>, string][] = [
    ['another protocol', { ...complete, protocol: 3 }, 'protocol 3'],
    ['a sequence number of 0', { ...complete, seq: 0 }, 'sequence'],
    ['a parent after itself', { ...complete, parent: { seq: 44, device: 'pc4f2a' } }, 'parent'],
    ['a parent that is only a number', { ...complete, parent: 43 }, 'parent'],
    [
      'a date that does not exist',
      { ...complete, createdAt: '2026-02-31T10:00:00Z' },
      'creation time',
    ],
    ['the hour 24', { ...complete, createdAt: '2026-01-01T24:00:00Z' }, 'creation time'],
    ['a schema that is not a migration', { ...complete, schema: 'latest' }, 'schema'],
    ['an app version that is not one', { ...complete, app: 'v2' }, 'app version'],
    ['a digest that is not SHA-256', { ...complete, journalSha256: 'abc' }, 'digest'],
    ['no creation time', { ...complete, createdAt: undefined }, 'creation time'],
  ];
  for (const [name, value, reason] of malformed) {
    it(`refuses ${name}, and says so`, () => {
      const parsed = parseManifest(JSON.parse(JSON.stringify(value)));

      expect(parsed.ok).toBe(false);
      expect(parsed.ok ? '' : parsed.reason).toContain(reason);
    });
  }

  it('lets an academy’s first version have no parent', () => {
    expect(parseManifest({ ...complete, seq: 1, parent: null }).ok).toBe(true);
  });
});

describe('a version file (#2029)', () => {
  const database = utf8('SQLite format 3\u0000 … the whole academy');
  const ref = { seq: 44, device: 'phone9c1e', parent: { seq: 43, device: 'pc4f2a' } };

  it('packs and unpacks the manifest, the journal and the database', async () => {
    const bytes = await packVersion(manifest, [checkIn, payment], database);

    const unpacked = await unpackVersion(bytes, ref);

    expect(unpacked.ok).toBe(true);
    if (unpacked.ok) {
      expect(unpacked.value.manifest).toMatchObject({ ...manifest });
      expect(unpacked.value.manifest.journalSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(unpacked.value.journal).toEqual([checkIn, payment]);
      expect(toHex(unpacked.value.database)).toBe(toHex(database));
    }
  });

  it('refuses to pack a manifest it could not read back', async () => {
    await expect(packVersion({ ...manifest, device: 'PC' }, [], database)).rejects.toThrow(
      'not a device id',
    );
  });

  it('refuses a file whose manifest names another version', async () => {
    const bytes = await packVersion(manifest, [], database);

    expect(await unpackVersion(bytes, { ...ref, seq: 45 })).toEqual({
      ok: false,
      reason: 'the manifest names another version than its file',
    });
    expect(
      await unpackVersion(bytes, { ...ref, parent: { seq: 43, device: 'phone9c1e' } }),
    ).toEqual({ ok: false, reason: 'the manifest names another version than its file' });
  });

  it('refuses to pack a journal it could not read back', async () => {
    await expect(packVersion(manifest, [payment, checkIn], database)).rejects.toThrow(
      'journal: entry 2: out of order',
    );
  });

  it('refuses a journal that does not match its digest', async () => {
    const bytes = await packVersion(manifest, [checkIn], database);
    const text = new TextDecoder().decode(bytes);
    const tampered = utf8(text.replace('athlete_ids', 'athlete_IDS'));

    expect(await unpackVersion(tampered, ref)).toEqual({
      ok: false,
      reason: 'the journal does not match its digest',
    });
  });

  it('refuses a file cut short, at either section', async () => {
    const bytes = await packVersion(manifest, [checkIn], database);

    expect(await unpackVersion(bytes.subarray(0, 10), ref)).toEqual({
      ok: false,
      reason: 'the manifest is cut short',
    });
    const manifestLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
    expect(await unpackVersion(bytes.subarray(0, 4 + manifestLength + 6), ref)).toEqual({
      ok: false,
      reason: 'the journal is cut short',
    });
  });

  it('refuses a manifest that is not JSON', async () => {
    const junk = concat(new Uint8Array([0, 0, 0, 3]), utf8('{x}'));

    const unpacked = await unpackVersion(junk, ref);

    expect(unpacked).toEqual({ ok: false, reason: 'manifest: a manifest is an object' });
  });
});
