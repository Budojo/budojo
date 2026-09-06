import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TokenVault, type SecretStore } from './token-vault.js';

/**
 * The bearer token at rest (#1227): encrypted on disk, cached in memory,
 * never plaintext, and never written when the OS keychain is unavailable.
 */

// A reversible marker "cipher" — enough to prove the plumbing and that what
// lands on disk is not the token itself.
const realStore: SecretStore = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('ENC:' + Buffer.from(s, 'utf8').toString('base64')),
  decryptString: (b) => {
    const text = b.toString();
    if (!text.startsWith('ENC:')) {
      throw new Error('not ours');
    }
    return Buffer.from(text.slice(4), 'base64').toString('utf8');
  },
};

/**
 * A log the assertions can read. The third constructor argument is required
 * rather than optional on purpose: an optional logger that a call site forgets
 * to pass reproduces the exact bug #1298 is about — a degraded mode nobody can
 * see — and the compiler is the only thing that reliably remembers.
 */
const recorder = (): { lines: string[]; log: (line: string) => void } => {
  const lines: string[] = [];

  return { lines, log: (line) => lines.push(line) };
};

/** For the cases whose subject is not the log. */
const quiet = (): void => undefined;

const dir = mkdtempSync(path.join(os.tmpdir(), 'budojo-vault-'));
const files: string[] = [];
const fresh = (): string => {
  const file = path.join(dir, `token-${files.length}.bin`);
  files.push(file);
  return file;
};

afterEach(() => {
  for (const file of files) {
    rmSync(file, { force: true });
  }
});

describe('TokenVault', () => {
  it('round-trips a token through a new instance (survives a restart)', () => {
    const file = fresh();
    new TokenVault(file, realStore, quiet).set('1|secret-token');

    // A second instance reads it back — the relaunch case.
    expect(new TokenVault(file, realStore, quiet).get()).toBe('1|secret-token');
  });

  it('writes ciphertext, not the token, to disk', () => {
    const file = fresh();
    new TokenVault(file, realStore, quiet).set('1|secret-token');

    const onDisk = readFileSync(file).toString();
    expect(onDisk.startsWith('ENC:')).toBe(true);
    expect(onDisk).not.toContain('secret-token');
  });

  it('caches after the first read so get() does not touch disk twice', () => {
    const file = fresh();
    let decrypts = 0;
    const counting: SecretStore = {
      ...realStore,
      decryptString: (b) => {
        decrypts++;
        return realStore.decryptString(b);
      },
    };
    new TokenVault(file, realStore, quiet).set('1|t');

    const vault = new TokenVault(file, counting, quiet);
    vault.get();
    vault.get();
    expect(decrypts).toBe(1);
  });

  it('clear() removes the file and forgets the token', () => {
    const file = fresh();
    const vault = new TokenVault(file, realStore, quiet);
    vault.set('1|t');

    vault.clear();

    expect(vault.get()).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it('does not write to disk when the OS keychain is unavailable', () => {
    // The whole point: degrade to session-only rather than store plaintext.
    const file = fresh();
    const unavailable: SecretStore = { ...realStore, isEncryptionAvailable: () => false };
    const vault = new TokenVault(file, unavailable, quiet);

    vault.set('1|t');

    expect(existsSync(file)).toBe(false);
    // Still usable this session.
    expect(vault.get()).toBe('1|t');
  });

  it('treats an unreadable file (foreign profile) as no token', () => {
    const file = fresh();
    new TokenVault(file, realStore, quiet).set('1|t');

    // A store that cannot decrypt what is there — a different Windows profile.
    const foreign: SecretStore = { ...realStore, decryptString: () => { throw new Error('DPAPI: access denied'); } };
    expect(new TokenVault(file, foreign, quiet).get()).toBeNull();
  });
});

/**
 * Every branch above that ends in `return` rather than a throw is a place the
 * owner experiences as "it asks me to log in every time" with nothing anywhere
 * saying why (#1298). Refusing to store a credential in the clear is right;
 * refusing silently is what makes it undiagnosable.
 */
describe('TokenVault — saying what it did', () => {
  it('reports the degraded mode when the OS keychain cannot encrypt', () => {
    const file = fresh();
    const { lines, log } = recorder();
    const unavailable: SecretStore = { ...realStore, isEncryptionAvailable: () => false };

    new TokenVault(file, unavailable, log).set('1|t');

    // The one line that turns an unexplained re-login into a known cause.
    expect(lines.join('\n')).toContain('encryption unavailable');
  });

  it('reports a stored token that cannot be read back', () => {
    const file = fresh();
    new TokenVault(file, realStore, quiet).set('1|t');
    const { lines, log } = recorder();
    const foreign: SecretStore = { ...realStore, decryptString: () => { throw new Error('DPAPI: access denied'); } };

    new TokenVault(file, foreign, log).get();

    // Same symptom as above, entirely different cause: the file IS there, and
    // this Windows profile is not the one that wrote it. Worth distinguishing,
    // because the answer differs — one is "your machine cannot", the other is
    // "this is someone else's token".
    expect(lines.join('\n')).toContain('could not be decrypted');
  });

  it('says nothing on the ordinary paths', () => {
    // A log that narrates success is a log nobody reads by the time it matters.
    const file = fresh();
    const { lines, log } = recorder();
    const vault = new TokenVault(file, realStore, log);

    vault.set('1|t');
    vault.get();
    vault.clear();

    expect(lines).toEqual([]);
  });

  it('never writes the token into the log', () => {
    const file = fresh();
    const { lines, log } = recorder();
    const unavailable: SecretStore = { ...realStore, isEncryptionAvailable: () => false };

    new TokenVault(file, unavailable, log).set('1|super-secret-token');

    // The whole class exists so this credential is never plaintext at rest.
    // Writing it to a log file on the failure path would hand it over exactly
    // when encryption is unavailable — the worst possible moment.
    expect(lines.join('\n')).not.toContain('super-secret-token');
  });
});
