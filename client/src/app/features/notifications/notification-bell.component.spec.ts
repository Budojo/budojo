import { signal, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NotificationBellComponent } from './notification-bell.component';
import {
  InboxNotification,
  NotificationInboxService,
} from '../../core/services/notification-inbox.service';
import { AuthService } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup(
  opts: { unread?: number; role?: 'owner' | 'athlete'; loadResponse?: 'ok' | 'error' } = {},
) {
  const unreadSig = signal(opts.unread ?? 0);
  const rowsSig = signal<readonly InboxNotification[]>([]);
  const hasUnreadSig = computed(() => unreadSig() > 0);
  const userSig = signal<{ role?: string } | null>({ role: opts.role ?? 'owner' });

  const load = vi.fn(() =>
    opts.loadResponse === 'error'
      ? throwError(() => new Error('boom'))
      : of({ data: [], meta: { unread_count: 0 } }),
  );
  const navigateByUrl = vi.fn(() => Promise.resolve(true));

  TestBed.configureTestingModule({
    imports: [NotificationBellComponent],
    providers: [
      {
        provide: NotificationInboxService,
        useValue: {
          rows: rowsSig.asReadonly(),
          unread: unreadSig.asReadonly(),
          hasUnread: hasUnreadSig,
          load,
        } as unknown as NotificationInboxService,
      },
      { provide: AuthService, useValue: { user: userSig.asReadonly() } as unknown as AuthService },
      { provide: Router, useValue: { navigateByUrl } as Partial<Router> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(NotificationBellComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, load, navigateByUrl };
}

describe('NotificationBellComponent (#418, #1129)', () => {
  // jsdom ships `visibilityState` as a prototype getter; remove our own
  // override after each test so it doesn't leak into later specs.
  afterEach(() => {
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });

  it('fires inboxService.load() on init to hydrate the badge', () => {
    const { load } = setup();
    expect(load).toHaveBeenCalledOnce();
  });

  it('navigates an owner to the owner notifications page on open', () => {
    const { cmp, navigateByUrl } = setup({ role: 'owner' });
    (cmp as unknown as { open: () => void }).open();
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard/notifications');
  });

  it('navigates an athlete to the athlete notifications page on open', () => {
    const { cmp, navigateByUrl } = setup({ role: 'athlete' });
    (cmp as unknown as { open: () => void }).open();
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard/me/notifications');
  });

  it('survives a failed load without throwing (badge stays at zero)', () => {
    const { cmp } = setup({ loadResponse: 'error' });
    expect((cmp as unknown as { unread: () => number }).unread()).toBe(0);
  });

  it('refreshes the count when the tab becomes visible', () => {
    const { cmp, load } = setup();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    expect(load).toHaveBeenCalledOnce();
    cmp.onVisibilityChange();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does NOT refresh when the tab becomes hidden', () => {
    const { cmp, load } = setup();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    expect(load).toHaveBeenCalledOnce();
    cmp.onVisibilityChange();
    expect(load).toHaveBeenCalledOnce();
  });
});
