import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';

import { WebPushError, WebPushService } from './web-push.service';

/**
 * The real `SwPush` is provided by `@angular/service-worker` and only
 * works behind a registered service worker — Vitest can't host one,
 * so we replace the token with a typed fake.
 */
interface FakeSwPushOptions {
  readonly isEnabled?: boolean;
  readonly subscription?: PushSubscription;
  readonly subscriptionError?: unknown;
}

function makeFakeSwPush(opts: FakeSwPushOptions = {}): {
  isEnabled: boolean;
  requestSubscription: () => Promise<PushSubscription>;
  unsubscribe: () => Promise<void>;
} {
  return {
    isEnabled: opts.isEnabled ?? true,
    async requestSubscription(): Promise<PushSubscription> {
      if (opts.subscriptionError !== undefined) {
        throw opts.subscriptionError;
      }
      if (!opts.subscription) {
        throw new Error('FakeSwPush: no subscription configured');
      }
      return opts.subscription;
    },
    async unsubscribe(): Promise<void> {
      return undefined;
    },
  };
}

function setup(fakeSwPushArgs: FakeSwPushOptions = {}): {
  service: WebPushService;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SwPush, useValue: makeFakeSwPush(fakeSwPushArgs) },
    ],
  });
  return {
    service: TestBed.inject(WebPushService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('WebPushService (#694)', () => {
  // JSDOM doesn't ship a `serviceWorker` on `navigator` or a
  // `PushManager` on `window` — fake both so `isSupported()` returns
  // `true` and the tests exercise the real branches (otherwise every
  // `subscribe()` call short-circuits to "not_supported" before
  // reaching the SwPush stub).
  beforeEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    (window as unknown as { PushManager: object }).PushManager = {};
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' as NotificationPermission, requestPermission: vi.fn() },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('currentPermission', () => {
    it('returns the live Notification.permission value', () => {
      (
        globalThis as unknown as { Notification: { permission: NotificationPermission } }
      ).Notification.permission = 'denied';
      const { service } = setup();
      expect(service.currentPermission()).toBe('denied');
    });

    it('returns "denied" when the Notification global is missing', () => {
      (globalThis as unknown as { Notification?: unknown }).Notification = undefined;
      const { service } = setup();
      expect(service.currentPermission()).toBe('denied');
    });
  });

  describe('fetchState', () => {
    it('GETs /me/push-subscriptions and unwraps the data + meta envelope', async () => {
      const { service, http } = setup();

      const promise = firstValueFrom(service.fetchState());
      const req = http.expectOne('/api/v1/me/push-subscriptions');
      expect(req.request.method).toBe('GET');
      req.flush({
        data: [
          {
            id: 1,
            endpoint_host: 'fcm.googleapis.com',

            endpoint_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            last_seen_at: null,
            created_at: '2026-05-14T07:00:00+00:00',
          },
        ],
        meta: { vapid_public_key: 'PUB', enabled: true },
      });

      const state = await promise;
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].endpoint_host).toBe('fcm.googleapis.com');
      expect(state.meta).toEqual({ vapid_public_key: 'PUB', enabled: true });
      http.verify();
    });
  });

  describe('subscribe', () => {
    it('throws WebPushError("not_supported") when SwPush is disabled', async () => {
      const { service, http } = setup({ isEnabled: false });
      await expect(service.subscribe('PUB')).rejects.toMatchObject({
        name: 'WebPushError',
        reason: 'not_supported',
      });
      http.verify();
    });

    it('maps a denied permission to WebPushError("permission_denied")', async () => {
      // The SwPush call rejects, AND Notification.permission is 'denied'
      // — together they're the unambiguous signal that the user clicked
      // Block on the OS prompt.
      const { service, http } = setup({
        subscriptionError: new DOMException('blocked', 'NotAllowedError'),
      });
      (
        globalThis as unknown as { Notification: { permission: NotificationPermission } }
      ).Notification.permission = 'denied';

      await expect(service.subscribe('PUB')).rejects.toMatchObject({
        name: 'WebPushError',
        reason: 'permission_denied',
      });
      http.verify();
    });

    it('exposes WebPushError as an Error subclass', () => {
      const err = new WebPushError('subscribe_failed');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WebPushError');
      expect(err.reason).toBe('subscribe_failed');
    });

    it('on success: POSTs the envelope and resolves with the created device', async () => {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: 'p256dh-value', auth: 'auth-secret' },
        }),
      } as unknown as PushSubscription;
      const { service, http } = setup({ subscription });

      const result = service.subscribe('PUB');
      // Drain microtasks so `swPush.requestSubscription` resolves and
      // the inner `http.post` is dispatched before `expectOne`. Two
      // awaits cover the await-chain inside `subscribe()`
      // (requestSubscription → toJSON → http.post).
      await Promise.resolve();
      await Promise.resolve();

      const req = http.expectOne('/api/v1/me/push-subscriptions');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256dh-value', auth: 'auth-secret' },
      });
      req.flush({
        data: {
          id: 42,
          endpoint_host: 'fcm.googleapis.com',

          endpoint_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          last_seen_at: null,
          created_at: '2026-05-14T07:00:00+00:00',
        },
      });

      await expect(result).resolves.toMatchObject({ id: 42, endpoint_host: 'fcm.googleapis.com' });
      http.verify();
    });

    it('maps a 503 response to WebPushError("server_not_configured")', async () => {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: 'p256dh-value', auth: 'auth-secret' },
        }),
      } as unknown as PushSubscription;
      const { service, http } = setup({ subscription });

      const result = service.subscribe('PUB');
      await Promise.resolve();
      await Promise.resolve();

      const req = http.expectOne('/api/v1/me/push-subscriptions');
      req.flush(
        { message: 'Web Push is not configured on this server.' },
        { status: 503, statusText: 'Service Unavailable' },
      );

      await expect(result).rejects.toMatchObject({
        name: 'WebPushError',
        reason: 'server_not_configured',
      });
      http.verify();
    });
  });

  describe('unsubscribe', () => {
    it('DELETEs /me/push-subscriptions/{id}', async () => {
      const { service, http } = setup();

      const result = service.unsubscribe(7);
      const req = http.expectOne('/api/v1/me/push-subscriptions/7');
      expect(req.request.method).toBe('DELETE');
      req.flush({ data: { revoked: true } });

      await expect(result).resolves.toBeUndefined();
      http.verify();
    });
  });
});
