import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { providePrimeNG } from 'primeng/config';
import Material from '@primeuix/themes/material';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
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
  ],
};
