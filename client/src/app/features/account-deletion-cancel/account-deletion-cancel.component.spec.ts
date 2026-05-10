import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AccountDeletionCancelComponent } from './account-deletion-cancel.component';

const TOKEN = 'a'.repeat(64);

interface HarnessOptions {
  readonly token?: string | null;
  readonly authToken?: string | null;
}

interface Harness {
  readonly fixture: ComponentFixture<AccountDeletionCancelComponent>;
  readonly httpMock: HttpTestingController;
  readonly el: HTMLElement;
  readonly component: AccountDeletionCancelComponent;
}

function setup(opts: HarnessOptions = {}): Harness {
  // Differentiate "token not specified" from "token explicitly null":
  // the former resolves to the default TOKEN, the latter passes null
  // through to the param map for the missing-token defense test.
  const tokenValue = 'token' in opts ? opts.token : TOKEN;

  TestBed.configureTestingModule({
    imports: [AccountDeletionCancelComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: {
              get: (key: string) => (key === 'token' ? tokenValue : null),
            },
          },
        },
      },
      {
        provide: AuthService,
        useValue: {
          getToken: vi.fn().mockReturnValue(opts.authToken ?? null),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AccountDeletionCancelComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // ngOnInit
  return {
    fixture,
    httpMock,
    el: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('AccountDeletionCancelComponent (#545)', () => {
  it('renders the loading panel before the API responds', () => {
    const { el, httpMock } = setup();

    expect(el.querySelector('[data-cy="account-deletion-cancel-loading"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="account-deletion-cancel-success"]')).toBeNull();

    httpMock.expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`).flush({
      data: { cancelled: true },
    });
  });

  it('renders the success panel when the API confirms cancellation', () => {
    const { fixture, httpMock, el } = setup();

    httpMock.expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`).flush({
      data: { cancelled: true },
    });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="account-deletion-cancel-success"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="account-deletion-cancel-loading"]')).toBeNull();
    expect(el.querySelector('[data-cy="account-deletion-cancel-cta-success"]')).not.toBeNull();
  });

  it('renders the no-longer-pending panel when cancelled=false', () => {
    // Same shape for already-clicked / never-valid / already-purged —
    // the API returns 200 with cancelled:false in all three cases and
    // we deliberately don't leak which one to the UI.
    const { fixture, httpMock, el } = setup();

    httpMock.expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`).flush({
      data: { cancelled: false },
    });
    fixture.detectChanges();

    expect(
      el.querySelector('[data-cy="account-deletion-cancel-no-longer-pending"]'),
    ).not.toBeNull();
    expect(el.querySelector('[data-cy="account-deletion-cancel-success"]')).toBeNull();
  });

  it('renders the error panel on HTTP failure', () => {
    const { fixture, httpMock, el } = setup();

    httpMock
      .expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="account-deletion-cancel-error"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="account-deletion-cancel-cta-error"]')).not.toBeNull();
  });

  it('targets /auth/login on the continue CTA for an unauthenticated visitor', () => {
    const { fixture, httpMock, component } = setup({ authToken: null });

    httpMock
      .expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`)
      .flush({ data: { cancelled: true } });
    fixture.detectChanges();

    // Reading the computed signal is the most stable assertion across
    // PrimeNG button-rendering shapes — `routerLink` on a `<p-button>`
    // does not always materialize as an `href` attribute in the DOM
    // (PrimeNG renders a `<button>` with a click handler, not an
    // `<a>`), so DOM-level assertions on `href` are flaky.
    expect(component['continueTarget']()).toBe('/auth/login');
  });

  it('targets /dashboard on the continue CTA for a still-signed-in visitor', () => {
    const { fixture, httpMock, component } = setup({ authToken: 'existing-session-token' });

    httpMock
      .expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`)
      .flush({ data: { cancelled: true } });
    fixture.detectChanges();

    expect(component['continueTarget']()).toBe('/dashboard');
  });

  it('renders error panel without firing a request when token is missing from the URL', () => {
    const { httpMock, el } = setup({ token: null });

    // The route binding constrains `:token` to the 64-char shape, so
    // a missing param shouldn't reach here — but the component
    // defensively bails to the error panel without a wasted HTTP
    // call. Pinned so a future refactor doesn't accidentally fire
    // a fetch for an empty token.
    httpMock.expectNone(() => true);
    expect(el.querySelector('[data-cy="account-deletion-cancel-error"]')).not.toBeNull();
  });
});
