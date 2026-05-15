import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
  NotificationOnboardingService,
  NotificationOnboardingState,
} from './notification-onboarding.service';
import {
  PushDevice,
  PushState,
  WebPushError,
  WebPushService,
} from './web-push.service';

class FakeWebPushService {
  isSupportedReturns = true;
  permissionReturns: NotificationPermission = 'default';
  fetchStateReturns: PushState | null = {
    devices: [],
    meta: { vapid_public_key: 'BVAPIDPUB', enabled: true },
  };
  fetchStateThrows = false;
  subscribeRejects: WebPushError | null = null;
  subscribeReturns: PushDevice = {
    id: 1,
    endpoint_host: 'fcm.googleapis.com',
    last_seen_at: null,
    created_at: '2026-05-15T07:00:00Z',
  };

  isSupported(): boolean {
    return this.isSupportedReturns;
  }
  currentPermission(): NotificationPermission {
    return this.permissionReturns;
  }
  fetchState() {
    if (this.fetchStateThrows) return throwError(() => new Error('boom'));
    return of(this.fetchStateReturns!);
  }
  subscribe = vi.fn(async (vapid: string) => {
    expect(vapid).toBeTruthy();
    if (this.subscribeRejects !== null) throw this.subscribeRejects;
    return this.subscribeReturns;
  });
}

describe('NotificationOnboardingService (#745)', () => {
  let service: NotificationOnboardingService;
  let webPush: FakeWebPushService;

  beforeEach(() => {
    localStorage.clear();
    webPush = new FakeWebPushService();
    TestBed.configureTestingModule({
      providers: [
        NotificationOnboardingService,
        { provide: WebPushService, useValue: webPush },
      ],
    });
    service = TestBed.inject(NotificationOnboardingService);
  });

  describe('requestPromptAfterAuth', () => {
    it('flips to visible when no skip condition fires', () => {
      const shown = service.requestPromptAfterAuth();
      expect(shown).toBe(true);
      expect(service.state()).toBe('visible' satisfies NotificationOnboardingState);
    });

    it('skips when the user has already decided in a previous session', () => {
      localStorage.setItem('budojo_notif_prompt_decided_v1', '1');
      const shown = service.requestPromptAfterAuth();
      expect(shown).toBe(false);
      expect(service.state()).toBe('idle');
    });

    it('skips when the browser already has a granted permission', () => {
      webPush.permissionReturns = 'granted';
      const shown = service.requestPromptAfterAuth();
      expect(shown).toBe(false);
    });

    it('skips when the browser already has a denied permission', () => {
      webPush.permissionReturns = 'denied';
      const shown = service.requestPromptAfterAuth();
      expect(shown).toBe(false);
    });

    it('skips when the browser does not support web push', () => {
      webPush.isSupportedReturns = false;
      const shown = service.requestPromptAfterAuth();
      expect(shown).toBe(false);
    });
  });

  describe('accept', () => {
    it('subscribes via the VAPID public key, marks decided, and resolves to succeeded', async () => {
      service.requestPromptAfterAuth();
      await service.accept();

      expect(webPush.subscribe).toHaveBeenCalledWith('BVAPIDPUB');
      expect(localStorage.getItem('budojo_notif_prompt_decided_v1')).toBe('1');
      expect(service.state()).toBe('succeeded' satisfies NotificationOnboardingState);
    });

    it('resolves to denied + decided when the user blocks the OS permission prompt', async () => {
      webPush.subscribeRejects = new WebPushError('permission_denied');
      service.requestPromptAfterAuth();
      await service.accept();

      expect(service.state()).toBe('denied' satisfies NotificationOnboardingState);
      expect(localStorage.getItem('budojo_notif_prompt_decided_v1')).toBe('1');
    });

    it('resolves to failed + decided when the backend has no VAPID key configured', async () => {
      webPush.fetchStateReturns = {
        devices: [],
        meta: { vapid_public_key: null, enabled: false },
      };
      service.requestPromptAfterAuth();
      await service.accept();

      expect(webPush.subscribe).not.toHaveBeenCalled();
      expect(service.state()).toBe('failed' satisfies NotificationOnboardingState);
      expect(localStorage.getItem('budojo_notif_prompt_decided_v1')).toBe('1');
    });

    it('resolves to failed + decided when fetchState errors', async () => {
      webPush.fetchStateThrows = true;
      service.requestPromptAfterAuth();
      await service.accept();

      expect(service.state()).toBe('failed' satisfies NotificationOnboardingState);
      expect(localStorage.getItem('budojo_notif_prompt_decided_v1')).toBe('1');
    });

    it('resolves to failed on a generic subscribe error', async () => {
      webPush.subscribeRejects = new WebPushError('subscribe_failed');
      service.requestPromptAfterAuth();
      await service.accept();

      expect(service.state()).toBe('failed' satisfies NotificationOnboardingState);
    });

    it('no-ops when the state machine is not currently visible', async () => {
      // State starts at idle; accept() must not blindly fire.
      await service.accept();
      expect(webPush.subscribe).not.toHaveBeenCalled();
      expect(service.state()).toBe('idle');
    });
  });

  describe('dismiss', () => {
    it('marks the user as decided and flips to dismissed', () => {
      service.requestPromptAfterAuth();
      service.dismiss();

      expect(localStorage.getItem('budojo_notif_prompt_decided_v1')).toBe('1');
      expect(service.state()).toBe('dismissed' satisfies NotificationOnboardingState);
    });

    it('no-ops when state is already idle', () => {
      service.dismiss();
      expect(localStorage.getItem('budojo_notif_prompt_decided_v1')).toBeNull();
      expect(service.state()).toBe('idle');
    });
  });

  describe('close', () => {
    it('resets state back to idle so the dialog hides', () => {
      service.requestPromptAfterAuth();
      service.dismiss();
      service.close();
      expect(service.state()).toBe('idle');
    });
  });
});
