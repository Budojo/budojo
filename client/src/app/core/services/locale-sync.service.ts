import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { LanguageService, SupportedLanguage } from './language.service';

/**
 * Tells the server which language the app is in (#1912).
 *
 * The server writes the owner's notifications itself — the inbox row and the
 * Windows notification the desktop shell raises from the same row — so it has
 * to know. It is told whenever the two disagree: on boot, the first time a
 * signed-in user loads with a language the server has not heard (every
 * install before this shipped), and whenever the language switch changes.
 *
 * A failed write is not retried until one of the two changes again: the cost
 * of missing it is notifications in the previous language, not a broken page.
 */
@Injectable({ providedIn: 'root' })
export class LocaleSyncService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      const lang = this.language.currentLang();
      if (user === null || user.locale === lang) return;
      this.send(lang);
    });
  }

  private send(locale: SupportedLanguage): void {
    this.http
      .patch<{ data: { locale: SupportedLanguage } }>(`${environment.apiBase}/api/v1/me/locale`, {
        locale,
      })
      .subscribe({
        next: (res) =>
          this.auth.user.update((user) => (user ? { ...user, locale: res.data.locale } : user)),
        error: () => undefined,
      });
  }
}
