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
import { MessageService } from 'primeng/api';

import { routes } from './app.routes';
import { httpInterceptors } from './core/interceptors/http-interceptors';
import { environment } from '../environments/environment';
import { provideBudojoTheme, provideBudojoTranslations } from './core/config/shared-ui-providers';
import { provideDesktopSync } from './core/desktop/desktop-sync';
import { providePhoneSync } from './core/mobile/phone-sync';

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
    // The order is the behaviour; see httpInterceptors.
    provideHttpClient(withInterceptors(httpInterceptors(environment.runtime))),
    provideAnimationsAsync(),
    // App-level MessageService so shared components (the email verification
    // pillola, the verify-error landing) fire toasts into the single
    // `<p-toast>` host mounted by the dashboard shell. Per-component
    // MessageService instances would each spawn their own toast host —
    // two pillolas on the same screen (sidebar + profile) overlap.
    MessageService,
    provideBudojoTheme(),
    // PWA service worker. Disabled in dev (`isDevMode()` returns true) so we
    // don't fight hot-reload with stale caches. Enabled after 30s in prod so
    // the first paint is never blocked on worker registration — the worker
    // then takes over for subsequent navigations + offline shell.
    //
    // Off on the desktop (#1224): the build emits no ngsw-worker.js, and a
    // worker caching the app shell across installer upgrades would bring back
    // exactly the stuck-on-old-bundle failure VersionCheckService exists to
    // detect (#548). Electron owns the update story there; one cache layer.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && environment.runtime === 'web',
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideBudojoTranslations(),
    // The sync between the owner's devices (#2046, #2032): each shell supplies it.
    ...(environment.runtime === 'mobile' ? [providePhoneSync()] : []),
    ...(environment.runtime === 'desktop' ? [provideDesktopSync()] : []),
  ],
};
