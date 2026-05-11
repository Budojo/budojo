import { signal, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Popover } from 'primeng/popover';
import { NotificationBellComponent } from './notification-bell.component';
import {
  InboxNotification,
  NotificationInboxService,
} from '../../core/services/notification-inbox.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function makeRow(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: 'n-1',
    type: 'medical_cert_expiring',
    body: 'something',
    link: '/dashboard/athletes/42',
    read_at: null,
    created_at: '2026-05-11T10:00:00Z',
    ...overrides,
  } as InboxNotification;
}

function setup(opts: {
  unread?: number;
  loadResponse?: 'ok' | 'error';
} = {}) {
  const unreadSig = signal(opts.unread ?? 0);
  const rowsSig = signal<readonly InboxNotification[]>([]);
  const hasUnreadSig = computed(() => unreadSig() > 0);

  const load = vi.fn(() =>
    opts.loadResponse === 'error'
      ? throwError(() => new Error('boom'))
      : of({ data: [], meta: { unread_count: 0 } }),
  );
  const markAsRead = vi.fn(() => of({ data: { id: 'n-1', read_at: '2026-05-11T10:00:00Z' } }));
  const markAllAsRead = vi.fn(() => of(0));

  const navigate = vi.fn(() => Promise.resolve(true));

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
          markAsRead,
          markAllAsRead,
        } as unknown as NotificationInboxService,
      },
      { provide: Router, useValue: { navigate } as Partial<Router> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(NotificationBellComponent);
  fixture.detectChanges();
  const cmp = fixture.componentInstance;
  // Replace the @ViewChild popover with a mock so we don't depend on PrimeNG internals
  (cmp as unknown as { panel: Popover }).panel = {
    hide: vi.fn(),
    toggle: vi.fn(),
  } as unknown as Popover;

  return { fixture, cmp, load, markAsRead, markAllAsRead, navigate };
}

describe('NotificationBellComponent (#418)', () => {
  it('fires inboxService.load() on init to hydrate the badge', () => {
    const { load } = setup();
    expect(load).toHaveBeenCalledOnce();
  });

  it('openRow on an unread row WITH a link marks read + navigates + closes the panel', () => {
    const { cmp, markAsRead, navigate } = setup();
    const row = makeRow({ read_at: null, link: '/dashboard/athletes/42' });
    const panel = (cmp as unknown as { panel: Popover }).panel;

    (cmp as unknown as { openRow: (r: InboxNotification) => void }).openRow(row);

    expect(markAsRead).toHaveBeenCalledOnce();
    expect(markAsRead).toHaveBeenCalledWith('n-1');
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/athletes/42']);
    expect(panel.hide).toHaveBeenCalledOnce();
  });

  it('openRow on an already-read row skips markAsRead but still navigates + closes', () => {
    const { cmp, markAsRead, navigate } = setup();
    const row = makeRow({ read_at: '2026-05-10T09:00:00Z', link: '/dashboard/payments' });

    (cmp as unknown as { openRow: (r: InboxNotification) => void }).openRow(row);

    expect(markAsRead).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/payments']);
  });

  it('openRow on an unread row WITHOUT a link marks read + closes but does not navigate', () => {
    const { cmp, markAsRead, navigate } = setup();
    const row = makeRow({ read_at: null, link: null });

    (cmp as unknown as { openRow: (r: InboxNotification) => void }).openRow(row);

    expect(markAsRead).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('markAllRead() calls inboxService.markAllAsRead()', () => {
    const { cmp, markAllAsRead } = setup();

    (cmp as unknown as { markAllRead: () => void }).markAllRead();

    expect(markAllAsRead).toHaveBeenCalledOnce();
  });

  it('refresh fires inboxService.load() again on subsequent calls', () => {
    const { cmp, load } = setup();
    // ngOnInit fired one — count baseline = 1
    expect(load).toHaveBeenCalledOnce();
    (cmp as unknown as { refresh: () => void }).refresh();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refresh resets the loading signal to false even when the request errors', () => {
    const { cmp } = setup({ loadResponse: 'error' });

    (cmp as unknown as { refresh: () => void }).refresh();

    expect((cmp as unknown as { loading: () => boolean }).loading()).toBe(false);
  });

  it('onVisibilityChange refreshes when the tab becomes visible', () => {
    const { cmp, load } = setup();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    expect(load).toHaveBeenCalledOnce(); // from ngOnInit
    cmp.onVisibilityChange();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('onVisibilityChange does NOT refresh when the tab becomes hidden', () => {
    const { cmp, load } = setup();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    expect(load).toHaveBeenCalledOnce(); // from ngOnInit
    cmp.onVisibilityChange();
    expect(load).toHaveBeenCalledOnce(); // not 2
  });
});
