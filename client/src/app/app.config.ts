import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  PreloadAllModules,
  provideRouter,
  withInMemoryScrolling,
  withPreloading,
  withRouterConfig,
} from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { providePrimeNG } from 'primeng/config';
import { MessageService } from 'primeng/api';
import Material from '@primeuix/themes/material';
import { provideTranslateService, TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { versionInterceptor } from './core/interceptors/version.interceptor';

import EN_TRANSLATIONS from '../../public/assets/i18n/en.json';
import IT_TRANSLATIONS from '../../public/assets/i18n/it.json';

/**
 * Synchronous translate loader (#273). The JSON files are imported
 * at build time and bundled into the app, so the first paint always
 * has translations available — no HTTP round-trip race that would
 * leave Cypress assertions reading raw `nav.athletes` keys before
 * the loader resolved.
 *
 * Trade-off vs the HTTP loader: ~10 kB inlined into the initial
 * bundle. Acceptable for an auth-walled dashboard where the user
 * sees the login screen translated immediately, and it removes the
 * whole class of "translation hadn't arrived yet" flakes from the
 * E2E suite.
 *
 * Adding a new locale (Spanish, German, etc.) means importing the
 * matching JSON above and adding the case below — same shape as
 * `client/src/test-utils/i18n-test.ts`.
 */
class BundledJsonLoader implements TranslateLoader {
  private readonly bundles: Record<string, TranslationObject> = {
    en: EN_TRANSLATIONS as unknown as TranslationObject,
    it: IT_TRANSLATIONS as unknown as TranslationObject,
  };

  getTranslation(lang: string): Observable<TranslationObject> {
    return of(this.bundles[lang] ?? this.bundles['en']);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `paramsInheritanceStrategy: 'always'` (#281) — child routes
    // inherit `:id`/etc from their parents. The athlete detail's
    // child routes (documents, attendance, payments, edit) all need
    // the parent `:id`, and the alternative would be `route.parent?.
    // paramMap` reads scattered across each child component.
    // PreloadAllModules: every lazy chunk is fetched in the background AFTER
    // the initial bundle finishes bootstrapping (Angular schedules the
    // preload work via the router's preloader, not via requestIdleCallback —
    // it runs on a microtask after bootstrap completes). Eliminates the
    // "blank-page on first nav" race when a route has chained lazy loads
    // (e.g. parent route + child route both lazy — Stats has this shape).
    // The initial bundle stays the same.
    provideRouter(
      routes,
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withPreloading(PreloadAllModules),
      // Enable native fragment anchor scrolling so a `routerLink="/help"`
      // with `[fragment]="'add-athlete'"` scrolls the matching
      // `<section id="add-athlete">` into view (#422). Deliberately do
      // NOT set `scrollPositionRestoration` — that flag is app-wide and
      // would change back/forward / route-switch scroll behavior across
      // every existing route, which is out of scope for this PR.
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
    ),
    // Auth interceptor first — it adds the bearer token to outgoing
    // requests. Error interceptor second — it inspects the *response*,
    // so it must sit downstream of any request mutation. Order matters:
    // if a 5xx ever bounces us via an auth refresh in the future, that
    // retry must run before the global error redirect.
    provideHttpClient(withInterceptors([versionInterceptor, authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    // App-level MessageService so shared components (the email verification
    // pillola, the verify-error landing) fire toasts into the single
    // `<p-toast>` host mounted by the dashboard shell. Per-component
    // MessageService instances would each spawn their own toast host —
    // two pillolas on the same screen (sidebar + profile) overlap.
    MessageService,
    providePrimeNG({
      // Material preset adopts the Material Design 3 palette + component styling.
      // See client/CLAUDE.md § Design canon for the full rationale.
      theme: {
        preset: Material,
        options: {
          darkModeSelector: '.dark',
          // Wrap PrimeNG's theme in a CSS @layer so our own `:root`
          // overrides in `src/styles/budojo-theme.scss` win the cascade.
          //
          // Without this, PrimeNG injects its theme `<style>` tag AFTER
          // the bundled app styles, so both declarations land at `:root`
          // with identical specificity → source-order tiebreak → Material
          // defaults win and our tokens are silently ignored. The button
          // stays green (Material's primary) instead of turning indigo
          // (ours), etc.
          //
          // CSS layers invert the tiebreak: unlayered rules always beat
          // layered rules, regardless of source order. Our `:root` block
          // is unlayered SCSS — putting PrimeNG in a named layer lets it
          // be the baseline that our overrides then reliably override.
          //
          // See gotchas.md § Design system / PrimeNG precedence.
          cssLayer: { name: 'primeng' },
        },
      },
    }),
    // PWA service worker. Disabled in dev (`isDevMode()` returns true) so we
    // don't fight hot-reload with stale caches. Enabled after 30s in prod so
    // the first paint is never blocked on worker registration — the worker
    // then takes over for subsequent navigations + offline shell.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // i18n (#273) — runtime locale switch with bundle-time JSON
    // resolution. `BundledJsonLoader` returns the imported JSON
    // synchronously, so a Cypress / Vitest assertion on translated
    // text never sees the raw `nav.athletes` key. Default + fallback
    // `en`; `LanguageService.bootstrap()` (called from `App.ngOnInit`)
    // picks the active locale from localStorage / navigator with the
    // `en` fallback.
    provideTranslateService({
      loader: { provide: TranslateLoader, useClass: BundledJsonLoader },
      defaultLanguage: 'en',
      fallbackLang: 'en',
    }),
  ],
};
