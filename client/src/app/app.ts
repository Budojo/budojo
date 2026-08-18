import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { AppUpdateService } from './core/services/app-update.service';
import { DesktopBridgeService } from './core/services/desktop-bridge.service';
import { LanguageService } from './core/services/language.service';
import { RuntimeService } from './core/services/runtime.service';
import { VersionCheckService } from './core/services/version-check.service';
import { CookieBannerComponent } from './features/cookie-banner/cookie-banner.component';
import { NotificationOnboardingDialogComponent } from './shared/components/notification-onboarding-dialog/notification-onboarding-dialog.component';
import { PushToastComponent } from './shared/components/push-toast/push-toast.component';
import { UpdateBannerComponent } from './shared/components/update-banner/update-banner.component';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    ToastModule,
    CookieBannerComponent,
    NotificationOnboardingDialogComponent,
    PushToastComponent,
    UpdateBannerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly languageService = inject(LanguageService);
  private readonly appUpdateService = inject(AppUpdateService);
  private readonly versionCheckService = inject(VersionCheckService);
  private readonly runtimeService = inject(RuntimeService);
  private readonly desktopBridge = inject(DesktopBridgeService);

  ngOnInit(): void {
    // i18n bootstrap (#273) — must run BEFORE any user-visible
    // string is rendered so the first paint is in the right
    // language. Reads localStorage / navigator.language with
    // an `en` fallback.
    this.languageService.bootstrap();

    // Wire the PWA service worker update listener so a deploy on
    // main lands in the user's browser without a manual cache
    // clear. No-op in dev mode (SwUpdate.isEnabled is false there).
    this.appUpdateService.start();

    // SW-independent cache-bust (#548). Polls /version.json on focus
    // + a 20-min interval and runs the nuclear unregister + clear +
    // reload sequence on a SHA mismatch with the embedded build SHA.
    // Also handles the boot-time `?force-update=1` escape hatch.
    // No-op when the build is on the `dev` sentinel SHA.
    this.versionCheckService.start();
    // Capability list (#1229): loaded once, shared by nav, guards and templates.
    void this.runtimeService.load();
    // Inside Budojo Desktop a clicked native toast asks the SPA to navigate
    // (#1225); on the web the bridge is absent and this is a no-op.
    this.desktopBridge.startNavigationRelay();

    // Marks the document so CSS can reserve the strip under the window
    // controls and make it draggable. The desktop shell hides the title bar
    // and paints the controls over the page, so without this the window
    // cannot be moved at all — and app content would sit under the buttons.
    if (this.desktopBridge.isDesktop) {
      document.documentElement.classList.add('budojo-desktop');
    }
  }
}
