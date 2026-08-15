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
    new TokenVault(file, realStore).set('1|secret-token');

    // A second instance reads it back — the relaunch case.
    expect(new TokenVault(file, realStore).get()).toBe('1|secret-token');
  });

  it('writes ciphertext, not the token, to disk', () => {
    const file = fresh();
    new TokenVault(file, realStore).set('1|secret-token');

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
    new TokenVault(file, realStore).set('1|t');

    const vault = new TokenVault(file, counting);
    vault.get();
    vault.get();
    expect(decrypts).toBe(1);
  });

  it('clear() removes the file and forgets the token', () => {
    const file = fresh();
    const vault = new TokenVault(file, realStore);
    vault.set('1|t');

    vault.clear();

    expect(vault.get()).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it('does not write to disk when the OS keychain is unavailable', () => {
    // The whole point: degrade to session-only rather than store plaintext.
    const file = fresh();
    const unavailable: SecretStore = { ...realStore, isEncryptionAvailable: () => false };
    const vault = new TokenVault(file, unavailable);

    vault.set('1|t');

    expect(existsSync(file)).toBe(false);
    // Still usable this session.
    expect(vault.get()).toBe('1|t');
  });

  it('treats an unreadable file (foreign profile) as no token', () => {
    const file = fresh();
    new TokenVault(file, realStore).set('1|t');

    // A store that cannot decrypt what is there — a different Windows profile.
    const foreign: SecretStore = { ...realStore, decryptString: () => { throw new Error('DPAPI: access denied'); } };
    expect(new TokenVault(file, foreign).get()).toBeNull();
  });
});
