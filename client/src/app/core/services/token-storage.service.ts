import { Injectable } from '@angular/core';

/**
 * Where the Sanctum bearer token lives (#1227).
 *
 * On the web it is `localStorage`, exactly as before. Inside Budojo Desktop
 * the token is held encrypted in the OS keychain by the main process, reached
 * through the preload bridge — never `localStorage`, which is plaintext on
 * disk next to the database.
 *
 * The desktop reads/writes are synchronous through the bridge (the main
 * process caches the decrypted token in memory after first unlock), so the
 * whole surface stays synchronous and the interceptor keeps calling
 * `getToken()` with no `await`. The choice is made once here, so no other
 * class knows there are two backings.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private static readonly KEY = 'auth_token';

  private readonly secure = typeof window !== 'undefined' ? window.__BUDOJO__?.token : undefined;

  get(): string | null {
    if (this.secure !== undefined) {
      return this.secure.get();
    }

    return localStorage.getItem(TokenStorageService.KEY);
  }

  set(token: string): void {
    if (this.secure !== undefined) {
      this.secure.set(token);

      return;
    }

    localStorage.setItem(TokenStorageService.KEY, token);
  }

  clear(): void {
    if (this.secure !== undefined) {
      this.secure.clear();

      return;
    }

    localStorage.removeItem(TokenStorageService.KEY);
  }
}
