import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { environment } from '../../../environments/environment';
import { NotificationsPageComponent } from './notifications-page.component';
import type { InboxNotification } from '../../core/services/notification-inbox.service';

const BASE = `${environment.apiBase}/api/v1/me/notifications`;

function notif(over: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: '1',
    type: 'x',
    kind: 'community_reaction_on_your_post',
    title: 'Marco reacted to your post',
    body: '',
    link: '/dashboard/me/feed',
    actor: { name: 'Marco Rossi', avatar_url: null },
    read_at: null,
    created_at: new Date().toISOString(),
    ...over,
  };
}

function setup(rows: InboxNotification[], unread = 0) {
  TestBed.configureTestingModule({
    imports: [NotificationsPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(NotificationsPageComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // ngOnInit → load()
  http.expectOne(BASE).flush({ data: rows, meta: { unread_count: unread } });
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

describe('NotificationsPageComponent (#1129)', () => {
  it('renders the page header', () => {
    const { el } = setup([]);
    expect(el.querySelector('[data-cy="page-header-title"]')).toBeTruthy();
  });

  it('shows the empty state when there are no notifications', () => {
    const { el } = setup([]);
    expect(el.querySelector('[data-cy="notifications-empty"]')).toBeTruthy();
  });

  it('surfaces unread rows under the "new" group', () => {
    const { el } = setup([notif({ id: 'a', read_at: null })], 1);
    expect(el.querySelector('[data-cy="notifications-group-new"]')).toBeTruthy();
    expect(el.querySelector('[data-cy="notification-a"]')).toBeTruthy();
  });

  it('renders an actorless notification as a type tile, not an avatar', () => {
    const { el } = setup(
      [notif({ id: 'sys', kind: 'weekly_recap', actor: null, read_at: null })],
      1,
    );
    const row = el.querySelector('[data-cy="notification-sys"]');
    expect(row?.querySelector('.notification__tile')).toBeTruthy();
    expect(row?.querySelector('app-user-avatar')).toBeFalsy();
  });

  it('filters to unread only', () => {
    const { el, fixture } = setup(
      [notif({ id: 'u', read_at: null }), notif({ id: 'r', read_at: new Date().toISOString() })],
      1,
    );
    (el.querySelector('[data-cy="notifications-filter-unread"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="notification-u"]')).toBeTruthy();
    expect(el.querySelector('[data-cy="notification-r"]')).toBeFalsy();
  });

  it('marks all as read via the header CTA', () => {
    const { el, http } = setup([notif({ id: 'u', read_at: null })], 1);
    (el.querySelector('[data-cy="notifications-mark-all"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/read-all`).flush({ data: { marked_read: 1 } });
    http.verify();
  });
});
