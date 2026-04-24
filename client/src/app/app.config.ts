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
        options: { darkModeSelector: '.dark' },
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
