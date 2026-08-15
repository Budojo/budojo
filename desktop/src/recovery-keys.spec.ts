import { describe, expect, it } from 'vitest';
import { generateSecrets, type Secrets } from './bootstrap';
import { decodeRecoveryCode, encodeRecoveryCode, RECOVERY_PREFIX } from './recovery-keys';

const SAMPLE: Secrets = {
  APP_KEY: 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  DOCUMENT_ENCRYPTION_KEY: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
};

describe('recovery-keys', () => {
  it('round-trips a key set through encode → decode', () => {
    const secrets = generateSecrets();
    const code = encodeRecoveryCode(secrets);

    expect(code.startsWith(RECOVERY_PREFIX)).toBe(true);

    const decoded = decodeRecoveryCode(code);
    expect(decoded).toEqual({ ok: true, secrets });
  });

  it('is stable for a known key set and carries no whitespace', () => {
    const code = encodeRecoveryCode(SAMPLE);

    expect(code).toBe(RECOVERY_PREFIX + Buffer.from(JSON.stringify({ v: 1, ...SAMPLE })).toString('base64url'));
    expect(code).not.toMatch(/\s/);
  });

  it('tolerates surrounding whitespace on decode (copy-paste slack)', () => {
    const code = encodeRecoveryCode(SAMPLE);
    const decoded = decodeRecoveryCode(`\n  ${code}\t `);

    expect(decoded).toEqual({ ok: true, secrets: SAMPLE });
  });

  it('refuses a string without the recovery prefix', () => {
    const decoded = decodeRecoveryCode('just some text the user pasted');
    expect(decoded).toEqual({ ok: false, reason: 'This is not a Budojo recovery code.' });
  });

  it('refuses an empty payload', () => {
    expect(decodeRecoveryCode(RECOVERY_PREFIX)).toEqual({
      ok: false,
      reason: 'The recovery code is empty.',
    });
  });

  it('refuses a truncated payload', () => {
    const code = encodeRecoveryCode(SAMPLE);
    const truncated = code.slice(0, code.length - 12);

    expect(decodeRecoveryCode(truncated)).toEqual({
      ok: false,
      reason: 'The recovery code is corrupted or incomplete.',
    });
  });

  it('refuses a payload whose keys are structurally invalid', () => {
    // Valid base64url, valid JSON, but an APP_KEY that fails parseSecrets.
    const bad = Buffer.from(JSON.stringify({ v: 1, APP_KEY: 'base64:short', DOCUMENT_ENCRYPTION_KEY: 'x' })).toString(
      'base64url',
    );

    expect(decodeRecoveryCode(RECOVERY_PREFIX + bad)).toEqual({
      ok: false,
      reason: 'The recovery code is corrupted or incomplete.',
    });
  });

  it('refuses a payload from an unsupported secrets version', () => {
    const future = Buffer.from(
      JSON.stringify({ v: 2, APP_KEY: SAMPLE.APP_KEY, DOCUMENT_ENCRYPTION_KEY: SAMPLE.DOCUMENT_ENCRYPTION_KEY }),
    ).toString('base64url');

    expect(decodeRecoveryCode(RECOVERY_PREFIX + future)).toEqual({
      ok: false,
      reason: 'The recovery code is corrupted or incomplete.',
    });
  });
});
