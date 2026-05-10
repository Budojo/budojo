import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
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
  readonly isLoggedIn?: boolean;
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
          // The component's `continueTarget` reads the signal so the
          // computed actually recomputes. The test harness exposes the
          // same shape (signal returning a bool) so test setup mirrors
          // the production injection contract.
          isLoggedIn: signal<boolean>(opts.isLoggedIn ?? false),
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
    const { fixture, httpMock, component } = setup({ isLoggedIn: false });

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
    const { fixture, httpMock, component } = setup({ isLoggedIn: true });

    httpMock
      .expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`)
      .flush({ data: { cancelled: true } });
    fixture.detectChanges();

    expect(component['continueTarget']()).toBe('/dashboard');
  });

  it('strips the one-time token from the URL on success (replaceState, not pushState)', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { fixture, httpMock } = setup();
    // Angular Router calls `history.replaceState` during bootstrap;
    // clear the spy AFTER setup so we count only this component's
    // own strip call.
    replaceState.mockClear();

    httpMock
      .expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`)
      .flush({ data: { cancelled: true } });
    fixture.detectChanges();

    // Defense-in-depth against the token leaking via screenshots,
    // browser history, or `Referer` headers on subsequent navigations.
    // `replaceState` so the user's history isn't polluted with two
    // entries for the same landing.
    expect(replaceState).toHaveBeenCalledTimes(1);
    // Read the actual call args — `expect.anything()` doesn't match
    // `null` (vitest semantics), and the history state is null by
    // default in happy-dom. Asserting the URL segment specifically is
    // the load-bearing check.
    const [, , url] = replaceState.mock.calls[0];
    expect(url).toBe('/account/deletion-cancel');
    replaceState.mockRestore();
  });

  it('strips the token even when the API reports cancelled=false', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { fixture, httpMock } = setup();
    replaceState.mockClear();

    httpMock
      .expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`)
      .flush({ data: { cancelled: false } });
    fixture.detectChanges();

    // Already-clicked / never-valid / grace-window-elapsed all
    // resolve here. The token is consumed (or invalid); no value in
    // keeping it in the URL.
    expect(replaceState).toHaveBeenCalledTimes(1);
    replaceState.mockRestore();
  });

  it('does NOT strip the URL on error — the token may still be valid for a retry', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { fixture, httpMock } = setup();
    replaceState.mockClear();

    httpMock
      .expectOne(`/api/v1/me/deletion-request/cancel/${TOKEN}`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // A network or server hiccup leaves the row unchanged; the user
    // can refresh to retry the same call. Stripping the URL would
    // make the retry impossible without copy-pasting the link out of
    // the email again.
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it('renders the no-longer-pending panel without firing a request when token is missing', () => {
    const { httpMock, el } = setup({ token: null });

    // No token in the URL — the user landed on the token-less variant
    // `/account/deletion-cancel` (e.g. after a successful consume
    // stripped the token via `history.replaceState` and they then
    // refreshed). Factually-correct render is "no longer pending"
    // because there's nothing to cancel; we avoid the 404 trap an
    // earlier shape had + we never fire a wasted HTTP call.
    httpMock.expectNone(() => true);
    expect(el.querySelector('[data-cy="account-deletion-cancel-no-longer-pending"]')).not.toBeNull();
  });
});
