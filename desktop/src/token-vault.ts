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
      // No safe place to persist it: keep it for this session only.
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
    if (!existsSync(this.filePath) || !this.store.isEncryptionAvailable()) {
      return null;
    }

    try {
      const decrypted = this.store.decryptString(readFileSync(this.filePath));

      return decrypted.length > 0 ? decrypted : null;
    } catch {
      // A token encrypted under a different OS user/profile cannot be read
      // here; treat it as absent and let the user sign in again.
      return null;
    }
  }
}
