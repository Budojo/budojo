import { Component, DestroyRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';

import { WebPushHandlerService } from './web-push-handler.service';
import { WebPushService } from './web-push.service';

interface FakeSwPushOptions {
  readonly isEnabled?: boolean;
}

/**
 * Minimal SwPush stand-in: real `notificationClicks` + `messages`
 * subjects we push events into from each test, plus a settable
 * `isEnabled` so we can prove the dev-mode (SW disabled) branch is a
 * no-op.
 */
function makeFakeSwPush(opts: FakeSwPushOptions = {}) {
  return {
    isEnabled: opts.isEnabled ?? true,
    notificationClicks: new Subject<{
      action: string;
      notification: { data?: { link?: string } };
    }>(),
    messages: new Subject<unknown>(),
  };
}

/**
 * Tiny standalone host so we can grab a real `DestroyRef` — the
 * service's `takeUntilDestroyed(destroyRef)` needs a working ref to
 * tie the subscriptions to a fixture lifecycle.
 */
@Component({ selector: 'app-host', template: '', standalone: true })
class HostStandalone {
  readonly ref = inject(DestroyRef);
}

function setup(opts: FakeSwPushOptions = {}): {
  service: WebPushHandlerService;
  swPush: ReturnType<typeof makeFakeSwPush>;
  navigateByUrl: ReturnType<typeof vi.fn>;
  toastAdd: ReturnType<typeof vi.fn>;
  reconcile: ReturnType<typeof vi.fn>;
  destroyRef: DestroyRef;
} {
  const swPush = makeFakeSwPush(opts);
  const navigateByUrl = vi.fn();
  const toastAdd = vi.fn();
  const reconcile = vi.fn().mockResolvedValue('in_sync');
  TestBed.configureTestingModule({
    imports: [HostStandalone],
    providers: [
      { provide: SwPush, useValue: swPush },
      { provide: Router, useValue: { navigateByUrl } },
      { provide: MessageService, useValue: { add: toastAdd } },
      { provide: WebPushService, useValue: { reconcileCurrentDevice: reconcile } },
    ],
  });
  const fixture = TestBed.createComponent(HostStandalone);
  return {
    service: TestBed.inject(WebPushHandlerService),
    swPush,
    navigateByUrl,
    toastAdd,
    reconcile,
    destroyRef: fixture.componentInstance.ref,
  };
}

describe('WebPushHandlerService (#702)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('navigates to data.link when the user clicks a delivered notification', () => {
    const { service, swPush, navigateByUrl, destroyRef } = setup();
    service.initialize(destroyRef);

    swPush.notificationClicks.next({
      action: '',
      notification: { data: { link: '/dashboard/me/feed#post-42' } },
    });

    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard/me/feed#post-42');
  });

  it('reconciles the current device on initialize (self-heal after deploy, #1065)', () => {
    const { service, reconcile, destroyRef } = setup();
    service.initialize(destroyRef);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('does NOT navigate when the click payload has no link', () => {
    const { service, swPush, navigateByUrl, destroyRef } = setup();
    service.initialize(destroyRef);

    swPush.notificationClicks.next({ action: '', notification: { data: {} } });

    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows an in-app toast on a foreground message', () => {
    const { service, swPush, toastAdd, destroyRef } = setup();
    service.initialize(destroyRef);

    swPush.messages.next({
      notification: {
        title: 'João Almeida commented',
        body: 'thanks for sharing',
        data: { link: '/dashboard/me/feed#post-42', kind: 'community_reply' },
      },
    });

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        // Routed to the dedicated push toast (#1063) so the on-brand,
        // clickable, dismissable template renders it — not the generic
        // app-wide toast.
        key: 'push',
        severity: 'info',
        summary: 'João Almeida commented',
        detail: 'thanks for sharing',
        // data.link rides along so the toast template can deep-link on click.
        data: { link: '/dashboard/me/feed#post-42', kind: 'community_reply' },
      }),
    );
  });

  it('is a no-op when SwPush is disabled (dev mode)', () => {
    const { service, swPush, navigateByUrl, toastAdd, reconcile, destroyRef } = setup({
      isEnabled: false,
    });
    service.initialize(destroyRef);

    swPush.notificationClicks.next({
      action: '',
      notification: { data: { link: '/somewhere' } },
    });
    swPush.messages.next({ notification: { title: 'X', body: '' } });

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(toastAdd).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });
});
