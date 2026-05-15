import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { SwPush, SwUpdate } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { NEVER } from 'rxjs';
import { App } from './app';
import { provideI18nTesting } from '../test-utils/i18n-test';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // The shell now mounts a `<p-toast>` so the verify-error landing
      // (and any future cross-shell component) can fire toasts. PrimeNG's
      // Toast injects MessageService at construction time.
      //
      // SwUpdate stub: `AppUpdateService.start()` is wired into the App's
      // ngOnInit. Without a SwUpdate provider Angular DI would throw a
      // NullInjectorError; an `isEnabled: false` stub mirrors the dev /
      // unit-test contract (no real worker present) so the service early-
      // returns and the App spec keeps testing what it cares about
      // (component creation + router-outlet rendering).
      //
      // `provideHttpClient` is needed because `VersionCheckService` (also
      // wired from App.ngOnInit, #548) injects `HttpClient`. The service
      // is a no-op when `VERSION.sha === 'dev'` (the default committed
      // sentinel during unit tests), so no actual fetch is fired — but
      // Angular still resolves the constructor injection at boot, which
      // requires the provider to exist.
      providers: [
        MessageService,
        provideRouter([]),
        provideAnimationsAsync(),
        provideHttpClient(),
        ...provideI18nTesting(),
        { provide: SwUpdate, useValue: { isEnabled: false, versionUpdates: NEVER } },
        // The app-root now mounts the notification onboarding dialog
        // (#745). That dialog injects `WebPushService` indirectly via
        // `NotificationOnboardingService`, and `WebPushService` injects
        // `SwPush`. Provide a stub that mirrors the dev / unit-test
        // contract (`isEnabled: false`) so the component constructs
        // without booting a real service worker.
        { provide: SwPush, useValue: { isEnabled: false, messages: NEVER, notificationClicks: NEVER } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
