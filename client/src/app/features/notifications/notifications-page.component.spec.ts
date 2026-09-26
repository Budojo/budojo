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

  // #1914 — the inbox is a to-do list the owner can tick things off.
  it('archives a row: out of the inbox at once, and offered back', () => {
    const { el, fixture, http } = setup([
      notif({ id: 'a', read_at: new Date().toISOString() }),
      notif({ id: 'b', read_at: new Date().toISOString() }),
    ]);

    (el.querySelector('[data-cy="notification-archive-a"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/a/archive`).flush({ data: { id: 'a', archived_at: 'x' } });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="notification-a"]')).toBeNull();
    expect(el.querySelector('[data-cy="notification-b"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="notifications-undo"]')?.textContent).toContain(
      'Notification archived',
    );
  });

  it('moves focus to "Undo" once the row that held it is gone', async () => {
    const { el, fixture, http } = setup([notif({ id: 'a', read_at: new Date().toISOString() })]);
    const button = el.querySelector('[data-cy="notification-archive-a"]') as HTMLButtonElement;
    button.focus();
    button.click();
    http.expectOne(`${BASE}/a/archive`).flush({ data: { id: 'a', archived_at: 'x' } });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(el.querySelector('[data-cy="notifications-undo-action"]'));
    // The status region was there before, so the new text is announced.
    expect(el.querySelector('[role="status"] [data-cy="notifications-undo"]')).not.toBeNull();
  });

  it('keeps "Undo" while the focus is on it, and lets it go once the focus leaves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { el, fixture, http } = setup([notif({ id: 'a', read_at: new Date().toISOString() })]);
      (el.querySelector('[data-cy="notification-archive-a"]') as HTMLButtonElement).click();
      http.expectOne(`${BASE}/a/archive`).flush({ data: { id: 'a', archived_at: 'x' } });
      fixture.detectChanges();
      await fixture.whenStable();
      const undo = el.querySelector('[data-cy="notifications-undo-action"]') as HTMLButtonElement;
      undo.focus();

      vi.advanceTimersByTime(30_000);
      fixture.detectChanges();
      // A bar that vanished under the focus would drop the user onto the page.
      expect(el.querySelector('[data-cy="notifications-undo"]')).not.toBeNull();

      undo.blur();
      vi.advanceTimersByTime(8_000);
      fixture.detectChanges();
      expect(el.querySelector('[data-cy="notifications-undo"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when the undo fails, rather than nothing', () => {
    const { el, fixture, http } = setup([notif({ id: 'a', read_at: new Date().toISOString() })]);
    (el.querySelector('[data-cy="notification-archive-a"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/a/archive`).flush({ data: { id: 'a', archived_at: 'x' } });
    fixture.detectChanges();

    (el.querySelector('[data-cy="notifications-undo-action"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/unarchive`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="notifications-undo-failed"]')?.textContent).toContain(
      'Could not undo',
    );
  });

  it('names the archive button by the notification it archives', () => {
    const { el } = setup([notif({ id: 'a', title: 'Giorgi has not trained' })]);

    const button = el.querySelector('[data-cy="notification-archive-a"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Archive: Giorgi has not trained');
    // Beside the row, never inside it: a button in a button is not a thing.
    expect(button.closest('[data-cy="notification-a"]')).toBeNull();
  });

  it('puts an archived row back on "Undo", and reads the inbox again', () => {
    const { el, fixture, http } = setup([notif({ id: 'a', read_at: new Date().toISOString() })]);
    (el.querySelector('[data-cy="notification-archive-a"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/a/archive`).flush({ data: { id: 'a', archived_at: 'x' } });
    fixture.detectChanges();

    (el.querySelector('[data-cy="notifications-undo-action"]') as HTMLButtonElement).click();
    const undo = http.expectOne(`${BASE}/unarchive`);
    expect(undo.request.body).toEqual({ ids: ['a'] });
    undo.flush({ data: { unarchived: 1 } });
    http.expectOne(BASE).flush({ data: [notif({ id: 'a' })], meta: { unread_count: 1 } });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="notification-a"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="notifications-undo"]')).toBeNull();
  });

  it('archives the read ones in one go, and leaves the unread', () => {
    const { el, fixture, http } = setup(
      [notif({ id: 'u', read_at: null }), notif({ id: 'r', read_at: new Date().toISOString() })],
      1,
    );

    (el.querySelector('[data-cy="notifications-archive-read"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/archive-read`).flush({ data: { archived: 1, ids: ['r'] } });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="notification-u"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="notification-r"]')).toBeNull();
  });

  it('offers "archive the read ones" only when there are read ones', () => {
    const { el } = setup([notif({ id: 'u', read_at: null })], 1);

    expect(el.querySelector('[data-cy="notifications-archive-read"]')).toBeNull();
  });

  it('lists the archived ones on their own tab, each with a way back', () => {
    const { el, fixture, http } = setup([]);

    (el.querySelector('[data-cy="notifications-filter-archived"]') as HTMLButtonElement).click();
    http
      .expectOne((r) => r.url === BASE && r.params.get('archived') === '1')
      .flush({ data: [notif({ id: 'z', archived_at: 'x' })], meta: { unread_count: 0 } });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="notification-z"]')).not.toBeNull();
    (el.querySelector('[data-cy="notification-unarchive-z"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/z/unarchive`).flush({ data: { id: 'z', archived_at: null } });
    http.expectOne(BASE).flush({ data: [], meta: { unread_count: 0 } });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="notification-z"]')).toBeNull();
  });

  it('marks all as read via the header CTA', () => {
    const { el, http } = setup([notif({ id: 'u', read_at: null })], 1);
    (el.querySelector('[data-cy="notifications-mark-all"]') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/read-all`).flush({ data: { marked_read: 1 } });
    http.verify();
  });
});
