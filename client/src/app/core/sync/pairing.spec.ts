import { toHex } from './bytes';
import { newSyncKey } from './envelope';
import { newFolderId, parseAppKeys, serializeAppKeys } from './keys';
import {
  CODE_CHARACTERS,
  decodePairingCode,
  encodePairingCode,
  encodePairingQr,
  QR_PREFIX,
} from './pairing';

describe('the pairing code (#2029)', () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i * 3);

  it('is 56 characters in fourteen groups of four', async () => {
    const code = await encodePairingCode(key);

    expect(CODE_CHARACTERS).toBe(56);
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('gives back the same key, typed or scanned', async () => {
    const typed = await decodePairingCode(await encodePairingCode(key));
    const scanned = await decodePairingCode(await encodePairingQr(key));

    expect(typed.ok && toHex(typed.value)).toBe(toHex(key));
    expect(scanned.ok && toHex(scanned.value)).toBe(toHex(key));
  });

  it('forgives how a person types it: case, spaces, O for 0, I or L for 1', async () => {
    const code = await encodePairingCode(key);
    const sloppy = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');

    const decoded = await decodePairingCode(sloppy);

    expect(decoded.ok && toHex(decoded.value)).toBe(toHex(key));
  });

  it('refuses a mistyped character rather than yielding a wrong key', async () => {
    const code = await encodePairingCode(key);
    const swapped = code[0] === 'A' ? `B${code.slice(1)}` : `A${code.slice(1)}`;

    expect(await decodePairingCode(swapped)).toEqual({
      ok: false,
      reason: 'the code does not check out: a character is mistyped',
    });
  });

  it('refuses a code cut short, and says how long it should be', async () => {
    const code = (await encodePairingCode(key)).slice(0, -5);

    const decoded = await decodePairingCode(code);

    expect(decoded.ok ? '' : decoded.reason).toContain('56 characters');
  });

  it('refuses a character the code never uses', async () => {
    const code = await encodePairingCode(key);

    expect(await decodePairingCode(`U${code.slice(1)}`)).toEqual({
      ok: false,
      reason: 'the code has a character that is not in it',
    });
  });

  it('puts a prefix on the QR, so a scan of anything else is refused at once', async () => {
    expect(await encodePairingQr(key)).toMatch(new RegExp(`^${QR_PREFIX}[0-9A-Z]{56}$`));
    expect((await decodePairingCode('https://example.com')).ok).toBe(false);
  });

  it('carries any key, every time', async () => {
    for (let i = 0; i < 20; i++) {
      const random = newSyncKey();
      const decoded = await decodePairingCode(await encodePairingCode(random));
      expect(decoded.ok && toHex(decoded.value)).toBe(toHex(random));
    }
  });
});

describe('keys.bjs (#2029)', () => {
  const keys = {
    folder: newFolderId(),
    APP_KEY: 'base64:' + 'A'.repeat(44),
    DOCUMENT_ENCRYPTION_KEY: 'B'.repeat(44),
  };

  it('round-trips through JSON', () => {
    expect(parseAppKeys(JSON.parse(JSON.stringify(serializeAppKeys(keys))))).toEqual({
      ok: true,
      value: keys,
    });
  });

  it('refuses what the desktop keychain would refuse, and says why', () => {
    expect(parseAppKeys({ v: 1, ...keys, APP_KEY: 'plain' })).toEqual({
      ok: false,
      reason: 'APP_KEY is not a Laravel key',
    });
    expect(parseAppKeys({ v: 1, ...keys, DOCUMENT_ENCRYPTION_KEY: 'short' })).toEqual({
      ok: false,
      reason: 'DOCUMENT_ENCRYPTION_KEY is too short',
    });
    expect(parseAppKeys({ v: 1, ...keys, folder: 'abc' })).toEqual({
      ok: false,
      reason: 'the folder id is not 32 hex characters',
    });
    expect(parseAppKeys({ v: 2, ...keys })).toEqual({
      ok: false,
      reason: 'keys version 2 is not supported',
    });
  });
});
