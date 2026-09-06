import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/**
 * The Sanctum bearer token at rest (#1227).
 *
 * Held encrypted on disk under userData via the injected secret store
 * (Electron's `safeStorage`, DPAPI-backed on Windows) and cached in memory
 * after first read, so the renderer's synchronous `token.get()` over the
 * bridge never blocks on a decrypt. Never `localStorage`, which is plaintext.
 *
 * If OS-level encryption is unavailable the token is not written at all — the
 * app degrades to asking for the password each launch rather than storing a
 * credential in the clear.
 *
 * That refusal is right, and until #1298 it was also **silent**. Both paths
 * that end in "no token" — the keychain saying it cannot encrypt, and a file
 * this Windows profile cannot decrypt — reach the owner as the same sentence,
 * *it asks me to log in every time*, with nothing anywhere saying which. So
 * the vault takes a log.
 *
 * It is a **required** constructor argument, not an optional one. An optional
 * logger is a wire nobody notices is missing, which is the same shape as the
 * bug: this repo has already shipped `renderer.log` completely inert that way,
 * green everywhere, found only when someone went looking for the file.
 */
export interface SecretStore {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class TokenVault {
  private cache: string | null = null;
  private loaded = false;

  constructor(
    private readonly filePath: string,
    private readonly store: SecretStore,
    /**
     * Failures only. A log that also narrates its successes is one nobody
     * reads by the time it matters — and every line here is written while a
     * credential is in hand, so the quiet path should stay quiet.
     */
    private readonly log: (line: string) => void,
  ) {}

  get(): string | null {
    if (!this.loaded) {
      this.cache = this.readFromDisk();
      this.loaded = true;
    }

    return this.cache;
  }

  set(token: string): void {
    this.cache = token;
    this.loaded = true;

    if (!this.store.isEncryptionAvailable()) {
      // No safe place to persist it: keep it for this session only. Never the
      // token itself in the message — this branch runs precisely when the OS
      // cannot protect it, so a log line would be the plaintext copy the whole
      // class exists to avoid.
      this.log('token vault: encryption unavailable — signing in will not survive a restart');

      return;
    }

    writeFileSync(this.filePath, this.store.encryptString(token), { mode: 0o600 });
  }

  clear(): void {
    this.cache = null;
    this.loaded = true;
    rmSync(this.filePath, { force: true });
  }

  private readFromDisk(): string | null {
    if (!existsSync(this.filePath)) {
      // The ordinary first run. Nothing to say.
      return null;
    }

    if (!this.store.isEncryptionAvailable()) {
      // A stored token we cannot even attempt to read. Distinct from the
      // branch below: nothing is wrong with the file, the machine is.
      this.log('token vault: a stored token exists but encryption is unavailable — ignoring it');

      return null;
    }

    try {
      const decrypted = this.store.decryptString(readFileSync(this.filePath));

      return decrypted.length > 0 ? decrypted : null;
    } catch {
      // A token encrypted under a different OS user/profile cannot be read
      // here; treat it as absent and let the user sign in again. Worth
      // separating from the case above, because the answer differs — this one
      // is "that token belongs to another Windows account", not "this machine
      // cannot keep secrets".
      this.log('token vault: the stored token could not be decrypted — signing in again');

      return null;
    }
  }
}
