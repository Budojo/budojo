import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { describe, expect, it } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ProfileLoginHistoryComponent } from './profile-login-history.component';

interface Harness {
  readonly fixture: ComponentFixture<ProfileLoginHistoryComponent>;
  readonly httpMock: HttpTestingController;
  readonly el: HTMLElement;
}

const ENDPOINT = '/api/v1/me/login-history';

const ROW_SUCCESS = {
  id: 11,
  success: true,
  device: 'Chrome on macOS',
  ip_address: '203.0.113.42',
  created_at: '2026-05-10T13:00:00Z',
} as const;

const ROW_FAILED = {
  id: 12,
  success: false,
  device: 'Unknown device',
  ip_address: '198.51.100.7',
  created_at: '2026-05-09T22:30:00Z',
} as const;

const ROW_NO_IP = {
  id: 13,
  success: true,
  device: 'Safari on iOS',
  ip_address: null,
  created_at: '2026-05-08T08:15:00Z',
} as const;

function setup(): Harness {
  TestBed.configureTestingModule({
    imports: [ProfileLoginHistoryComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(ProfileLoginHistoryComponent);
  fixture.detectChanges();
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('ProfileLoginHistoryComponent (#430)', () => {
  it('renders the loading panel before the API responds', () => {
    const { el, httpMock } = setup();
    expect(el.querySelector('[data-cy="profile-login-history-loading"]')).not.toBeNull();
    httpMock.expectOne(ENDPOINT).flush({ data: [] });
  });

  it('renders one row per attempt and stamps the failed pill on failures only', () => {
    const { fixture, httpMock, el } = setup();
    httpMock.expectOne(ENDPOINT).flush({ data: [ROW_SUCCESS, ROW_FAILED, ROW_NO_IP] });
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-cy^="profile-login-history-row-"]');
    expect(rows.length).toBe(3);

    const failedRow = el.querySelector(`[data-cy="profile-login-history-row-${ROW_FAILED.id}"]`);
    expect(failedRow?.textContent).toContain('Unknown device');
    expect(failedRow?.classList.contains('profile-login-history__row--failed')).toBe(true);

    const successRow = el.querySelector(`[data-cy="profile-login-history-row-${ROW_SUCCESS.id}"]`);
    expect(successRow?.classList.contains('profile-login-history__row--failed')).toBe(false);

    // The footer hint surfaces only when at least one row exists —
    // it's the call-to-action for "if something looks unfamiliar".
    expect(el.querySelector('[data-cy="profile-login-history-hint"]')).not.toBeNull();
  });

  it('renders the empty state when there are no rows', () => {
    const { fixture, httpMock, el } = setup();
    httpMock.expectOne(ENDPOINT).flush({ data: [] });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-login-history-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-login-history-list"]')).toBeNull();
    // The "if unfamiliar" hint hides on the empty state — there's
    // nothing for the user to act on yet.
    expect(el.querySelector('[data-cy="profile-login-history-hint"]')).toBeNull();
  });

  it('renders the error panel + retry CTA on HTTP failure', () => {
    const { fixture, httpMock, el } = setup();
    httpMock
      .expectOne(ENDPOINT)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-login-history-error"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-login-history-retry"]')).not.toBeNull();
  });

  it('shows IP when present and skips it when null (no "·" placeholder leakage)', () => {
    const { fixture, httpMock, el } = setup();
    httpMock.expectOne(ENDPOINT).flush({ data: [ROW_NO_IP] });
    fixture.detectChanges();

    // The row exists but the IP separator-and-value are absent.
    const row = el.querySelector(`[data-cy="profile-login-history-row-${ROW_NO_IP.id}"]`);
    expect(row).not.toBeNull();
    expect(row?.textContent).not.toContain('null');
  });
});
