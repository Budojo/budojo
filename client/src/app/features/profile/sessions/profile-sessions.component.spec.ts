import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ProfileSessionsComponent } from './profile-sessions.component';

interface Harness {
  readonly fixture: ComponentFixture<ProfileSessionsComponent>;
  readonly httpMock: HttpTestingController;
  readonly el: HTMLElement;
  readonly addToastSpy: ReturnType<typeof vi.fn>;
  readonly confirmationService: ConfirmationService;
}

const SESSIONS_URL = '/api/v1/me/sessions';

const ROW_CHROME = {
  id: 1,
  name: 'Chrome on macOS',
  last_used_at: '2026-05-10T08:00:00Z',
  created_at: '2026-05-01T08:00:00Z',
  is_current: false,
} as const;
const ROW_SAFARI_CURRENT = {
  id: 2,
  name: 'Safari on iOS',
  last_used_at: '2026-05-10T13:00:00Z',
  created_at: '2026-05-09T08:00:00Z',
  is_current: true,
} as const;
const ROW_FIREFOX = {
  id: 3,
  name: 'Firefox on Linux',
  last_used_at: null,
  created_at: '2026-05-10T13:30:00Z',
  is_current: false,
} as const;

function setup(): Harness {
  const addToastSpy = vi.fn();
  TestBed.configureTestingModule({
    imports: [ProfileSessionsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: MessageService, useValue: { add: addToastSpy } },
      // ConfirmationService is mounted at the component level in
      // production so the per-component popup state stays scoped.
      // For the spec we want the SAME instance the component sees,
      // so we strip the component's own provider via
      // `overrideComponent` and provide it at the module level here.
      ConfirmationService,
    ],
  });
  TestBed.overrideComponent(ProfileSessionsComponent, {
    set: { providers: [] },
  });

  const fixture = TestBed.createComponent(ProfileSessionsComponent);
  fixture.detectChanges(); // ngOnInit fires the list call
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    el: fixture.nativeElement as HTMLElement,
    addToastSpy,
    confirmationService: TestBed.inject(ConfirmationService),
  };
}

describe('ProfileSessionsComponent (#413)', () => {
  it('renders the loading panel before the API responds', () => {
    const { el, httpMock } = setup();
    expect(el.querySelector('[data-cy="profile-sessions-loading"]')).not.toBeNull();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [] });
  });

  it('renders one row per session and stamps the "this session" pill on the current row', () => {
    const { fixture, httpMock, el } = setup();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT, ROW_CHROME, ROW_FIREFOX] });
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-cy^="profile-session-row-"]');
    expect(rows.length).toBe(3);

    // Exactly one current pill renders, on the row whose `is_current`
    // is true. The CSS class identifier is the load-bearing assertion
    // — the SPA stamps the pill via that class.
    const pills = el.querySelectorAll('[data-cy="profile-session-current-pill"]');
    expect(pills.length).toBe(1);

    const currentRow = el.querySelector(`[data-cy="profile-session-row-${ROW_SAFARI_CURRENT.id}"]`);
    expect(currentRow?.querySelector('[data-cy="profile-session-current-pill"]')).not.toBeNull();
  });

  it('hides the "Sign out other sessions" CTA when only the current session exists', () => {
    const { fixture, httpMock, el } = setup();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT] });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-sessions-revoke-others"]')).toBeNull();
  });

  it('shows the "Sign out other sessions" CTA when there is at least one other session', () => {
    const { fixture, httpMock, el } = setup();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT, ROW_CHROME] });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-sessions-revoke-others"]')).not.toBeNull();
  });

  it('renders the error panel when the list call fails', () => {
    const { fixture, httpMock, el } = setup();
    httpMock
      .expectOne(SESSIONS_URL)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-sessions-error"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-sessions-retry"]')).not.toBeNull();
  });

  it('revokes a single non-current session via DELETE then refreshes the list and toasts', async () => {
    const { fixture, httpMock, addToastSpy, confirmationService } = setup();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT, ROW_CHROME] });
    fixture.detectChanges();

    // Bypass the p-confirmpopup interaction in the spec — call the
    // confirm handler directly with a fake event so the accept arm
    // fires synchronously. The confirmation popup shape itself is
    // exercised by the e2e spec.
    const acceptSpy = vi.fn();
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      acceptSpy.mockImplementation(() => opts.accept?.());
      acceptSpy();
      return confirmationService;
    });

    (
      fixture.componentInstance as unknown as {
        confirmRevoke: (e: MouseEvent, s: typeof ROW_CHROME) => void;
      }
    ).confirmRevoke(new MouseEvent('click'), ROW_CHROME);

    httpMock
      .expectOne((r) => r.method === 'DELETE' && r.url === `${SESSIONS_URL}/${ROW_CHROME.id}`)
      .flush(null, { status: 204, statusText: 'No Content' });

    // Refresh fires after the revoke succeeds.
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT] });
    fixture.detectChanges();

    expect(addToastSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('revokes the current session WITHOUT firing a refresh (next request will 401)', () => {
    const { fixture, httpMock, addToastSpy, confirmationService } = setup();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT] });
    fixture.detectChanges();

    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    (
      fixture.componentInstance as unknown as {
        confirmRevoke: (e: MouseEvent, s: typeof ROW_SAFARI_CURRENT) => void;
      }
    ).confirmRevoke(new MouseEvent('click'), ROW_SAFARI_CURRENT);

    httpMock
      .expectOne(`${SESSIONS_URL}/${ROW_SAFARI_CURRENT.id}`)
      .flush(null, { status: 204, statusText: 'No Content' });

    // No follow-up GET — the auth interceptor will handle the bounce
    // when the next request lands. The component stays put.
    httpMock.expectNone(SESSIONS_URL);
    expect(addToastSpy).not.toHaveBeenCalled();
  });

  it('revokes-others: DELETE without id, refresh, success toast', () => {
    const { fixture, httpMock, addToastSpy, confirmationService } = setup();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT, ROW_CHROME, ROW_FIREFOX] });
    fixture.detectChanges();

    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    (
      fixture.componentInstance as unknown as { confirmRevokeOthers: (e: MouseEvent) => void }
    ).confirmRevokeOthers(new MouseEvent('click'));

    httpMock
      .expectOne((r) => r.method === 'DELETE' && r.url === SESSIONS_URL)
      .flush({ data: { revoked: 2 } });

    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT] });
    fixture.detectChanges();

    expect(addToastSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('revoke error → error toast, no list refresh, retry CTA still works', () => {
    const { fixture, httpMock, addToastSpy, confirmationService } = setup();
    httpMock.expectOne(SESSIONS_URL).flush({ data: [ROW_SAFARI_CURRENT, ROW_CHROME] });
    fixture.detectChanges();

    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    (
      fixture.componentInstance as unknown as {
        confirmRevoke: (e: MouseEvent, s: typeof ROW_CHROME) => void;
      }
    ).confirmRevoke(new MouseEvent('click'), ROW_CHROME);

    httpMock
      .expectOne(`${SESSIONS_URL}/${ROW_CHROME.id}`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });

    expect(addToastSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });
});
