import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { SwPush } from '@angular/service-worker';
import { MessageService } from 'primeng/api';

import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ProfileBrowserNotificationsComponent } from './profile-browser-notifications.component';

/**
 * Wires the component with the standard test scaffolding: HttpClient
 * test backend, the i18n testing harness, animations (PrimeNG button +
 * spinner expect them), and a minimal SwPush stand-in.
 *
 * The fake SwPush is intentionally simple — the subscribe / unsubscribe
 * flows that exercise it end-to-end are covered by the service spec
 * and the cypress flow. Here we focus on the panel's state transitions
 * (loading → unsupported / server-disabled / off / on) based on what
 * the backend hands us.
 */
function setup(options: { browserSupported?: boolean } = {}): {
  fixture: ComponentFixture<ProfileBrowserNotificationsComponent>;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ProfileBrowserNotificationsComponent],
    providers: [
      provideAnimationsAsync(),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideI18nTesting(),
      MessageService,
      {
        provide: SwPush,
        useValue: {
          isEnabled: false,
          requestSubscription: () => Promise.reject(new Error('SwPush disabled in unit tests')),
          unsubscribe: () => Promise.resolve(),
        },
      },
    ],
  });

  // The component reads `isSupported` ONCE in its constructor, so the
  // browser-API stubs have to be in place BEFORE `createComponent`.
  // Default to "supported" for every test that doesn't opt out.
  if (options.browserSupported !== false) {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    (window as unknown as { PushManager: object }).PushManager = {};
  } else {
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  }

  const fixture = TestBed.createComponent(ProfileBrowserNotificationsComponent);
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

describe('ProfileBrowserNotificationsComponent (#694)', () => {
  beforeEach(() => {
    // JSDOM doesn't ship the Notification API — without this mock,
    // `currentPermission()` returns 'denied' (its safe fallback when
    // the global is missing) and every test would land in the
    // 'permission-denied' branch instead of the one under test.
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' as NotificationPermission, requestPermission: vi.fn() },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the loading spinner before the first response lands', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-loading"]'),
    ).toBeTruthy();
    // Drain the in-flight request so afterEach `verify()` stays clean.
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [],
      meta: { vapid_public_key: null, enabled: false },
    });
  });

  it('renders the "server-disabled" notice when the backend reports VAPID unset', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();

    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [],
      meta: { vapid_public_key: null, enabled: false },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-cy="profile-browser-notifications-server-disabled"]',
      ),
    ).toBeTruthy();
  });

  it('renders the "off" CTA when the backend reports an empty device list + VAPID set', async () => {
    const { fixture, http } = setup();
    fixture.detectChanges();

    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-off"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-enable"]'),
    ).toBeTruthy();
  });

  it('renders the device list when at least one subscription exists', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();

    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [
        {
          id: 11,
          endpoint_host: 'fcm.googleapis.com',
          last_seen_at: null,
          created_at: '2026-05-14T07:00:00+00:00',
        },
      ],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-on"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-device-11"]'),
    ).toBeTruthy();
  });

  it('renders the "permission-denied" notice when Notification.permission is denied', () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'denied' as NotificationPermission, requestPermission: vi.fn() },
      configurable: true,
      writable: true,
    });

    const { fixture, http } = setup();
    fixture.detectChanges();
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-cy="profile-browser-notifications-permission-denied"]',
      ),
    ).toBeTruthy();
  });

  it('renders the device list ALONGSIDE a non-on state so revoke stays accessible', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    // server-disabled (meta.enabled = false) PLUS one pre-existing
    // device. The action surface is blocked, but the user must still
    // be able to revoke what they already opted into.
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [
        {
          id: 7,
          endpoint_host: 'fcm.googleapis.com',
          last_seen_at: null,
          created_at: '2026-05-14T07:00:00+00:00',
        },
      ],
      meta: { vapid_public_key: null, enabled: false },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-cy="profile-browser-notifications-server-disabled"]',
      ),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-device-7"]'),
    ).toBeTruthy();
  });

  it('renders the "unsupported" notice when serviceWorker / PushManager are missing', () => {
    const { fixture, http } = setup({ browserSupported: false });
    fixture.detectChanges();
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-unsupported"]'),
    ).toBeTruthy();
  });

  // #819 — diagnostic "Send test notification" button under the "on"
  // branch lets the user verify their device's push channel any time.

  it('renders the Send-test button only when push is on (devices present)', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [
        {
          id: 11,
          endpoint_host: 'fcm.googleapis.com',
          last_seen_at: null,
          created_at: '2026-05-19T09:00:00Z',
        },
      ],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-send-test"]'),
    ).toBeTruthy();
  });

  it('does NOT render the Send-test button in the "off" state (no devices)', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-send-test"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="profile-browser-notifications-off"]'),
    ).toBeTruthy();
  });

  it('POSTs /me/push-subscriptions/test on Send-test click + surfaces the success toast', async () => {
    const { fixture, http } = setup();
    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    fixture.detectChanges();
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [
        {
          id: 11,
          endpoint_host: 'fcm.googleapis.com',
          last_seen_at: null,
          created_at: '2026-05-19T09:00:00Z',
        },
      ],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '[data-cy="profile-browser-notifications-send-test"] button',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();

    http
      .expectOne((req) => req.url === '/api/v1/me/push-subscriptions/test' && req.method === 'POST')
      .flush({ data: { sent: true } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('surfaces an error toast when /me/push-subscriptions/test fails', async () => {
    const { fixture, http } = setup();
    const messageService = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messageService, 'add');
    fixture.detectChanges();
    http.expectOne('/api/v1/me/push-subscriptions').flush({
      data: [
        {
          id: 11,
          endpoint_host: 'fcm.googleapis.com',
          last_seen_at: null,
          created_at: '2026-05-19T09:00:00Z',
        },
      ],
      meta: { vapid_public_key: 'PUB', enabled: true },
    });
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector(
        '[data-cy="profile-browser-notifications-send-test"] button',
      ) as HTMLButtonElement
    ).click();

    http
      .expectOne('/api/v1/me/push-subscriptions/test')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });
});
