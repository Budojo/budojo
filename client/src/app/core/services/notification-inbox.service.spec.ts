import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { InboxNotification, NotificationInboxService } from './notification-inbox.service';

function row(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'App\\Notifications\\Test',
    title: 'Medical cert expiring',
    body: 'Mario Rossi — 7 days left',
    link: '/dashboard/athletes/42/documents',
    read_at: null,
    created_at: '2026-05-11T08:00:00Z',
    ...overrides,
  };
}

describe('NotificationInboxService (#418)', () => {
  let service: NotificationInboxService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationInboxService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotificationInboxService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GET /me/notifications hydrates rows + unread count', () => {
    service.load().subscribe();
    const req = httpMock.expectOne('/api/v1/me/notifications');
    req.flush({
      data: [row(), row({ id: 'b', read_at: '2026-05-10T08:00:00Z' })],
      meta: { unread_count: 1 },
    });

    expect(service.rows().length).toBe(2);
    expect(service.unread()).toBe(1);
    expect(service.hasUnread()).toBe(true);
  });

  it('markAsRead flips the row + decrements unread', () => {
    service.load().subscribe();
    httpMock.expectOne('/api/v1/me/notifications').flush({
      data: [row({ id: 'a' }), row({ id: 'b' })],
      meta: { unread_count: 2 },
    });

    service.markAsRead('a').subscribe();
    httpMock
      .expectOne('/api/v1/me/notifications/a/read')
      .flush({ data: { id: 'a', read_at: '2026-05-11T09:00:00Z' } });

    expect(service.unread()).toBe(1);
    const rowA = service.rows().find((n) => n.id === 'a');
    expect(rowA?.read_at).toBe('2026-05-11T09:00:00Z');
  });

  it('markAllAsRead zeroes unread + stamps every row', () => {
    service.load().subscribe();
    httpMock.expectOne('/api/v1/me/notifications').flush({
      data: [row({ id: 'a' }), row({ id: 'b' })],
      meta: { unread_count: 2 },
    });

    service.markAllAsRead().subscribe();
    httpMock.expectOne('/api/v1/me/notifications/read-all').flush({ data: { marked_read: 2 } });

    expect(service.unread()).toBe(0);
    expect(service.rows().every((n) => n.read_at !== null)).toBe(true);
  });
});
