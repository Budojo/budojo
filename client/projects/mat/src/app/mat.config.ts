import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideBudojoTheme,
  provideBudojoTranslations,
} from '../../../../src/app/core/config/shared-ui-providers';

/**
 * The mat app's providers (#2027). The theme and the translations are the
 * desktop SPA's own (`shared-ui-providers.ts`); nothing here talks to an API.
 *
 * `provideHttpClient()` is only there because `<app-athlete-identity>` reaches
 * `AcademyService` through `BeltLadderService`, and that service injects the
 * client. No request is ever sent: the ladder falls back to BJJ until the
 * snapshot supplies the academy's own (#2034). `provideRouter([])` is there for
 * the identity's `RouterLink`, which the mat app never renders.
 */
export const matConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter([]),
    provideHttpClient(),
    provideAnimationsAsync(),
    provideBudojoTheme(),
    provideBudojoTranslations(),
  ],
};
