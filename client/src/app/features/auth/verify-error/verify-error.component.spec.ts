import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { VerifyErrorComponent } from './verify-error.component';
import { AuthService } from '../../../core/services/auth.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

function setup(opts: {
  hasToken?: boolean;
  resendResponse?: 'ok' | '429' | '401' | 'generic';
} = {}) {
  const getToken = vi.fn(() => (opts.hasToken === false ? null : 'tok'));

  const resendVerificationEmail = vi.fn(() => {
    if (opts.resendResponse === '429') {
      return throwError(() => new HttpErrorResponse({ status: 429 }));
    }
    if (opts.resendResponse === '401') {
      return throwError(() => new HttpErrorResponse({ status: 401 }));
    }
    if (opts.resendResponse === 'generic') {
      return throwError(() => new HttpErrorResponse({ status: 500 }));
    }
    return of(undefined);
  });

  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  const messageAdd = vi.fn();

  TestBed.configureTestingModule({
    imports: [VerifyErrorComponent],
    providers: [
      {
        provide: AuthService,
        useValue: { getToken, resendVerificationEmail } as unknown as AuthService,
      },
      { provide: Router, useValue: { navigateByUrl } as Partial<Router> },
      { provide: MessageService, useValue: { add: messageAdd } as Partial<MessageService> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(VerifyErrorComponent);
  fixture.detectChanges();
  return {
    fixture,
    cmp: fixture.componentInstance,
    resendVerificationEmail,
    navigateByUrl,
    messageAdd,
  };
}

describe('VerifyErrorComponent (#580 + #585)', () => {
  it('exposes canResend=true when a Sanctum token is in localStorage', () => {
    const { cmp } = setup({ hasToken: true });
    expect((cmp as unknown as { canResend: boolean }).canResend).toBe(true);
  });

  it('exposes canResend=false when no token is present (cross-device verify click)', () => {
    const { cmp } = setup({ hasToken: false });
    expect((cmp as unknown as { canResend: boolean }).canResend).toBe(false);
  });

  it('resend() on success redirects to /dashboard/profile and clears sending()', () => {
    const { cmp, resendVerificationEmail, navigateByUrl } = setup({ resendResponse: 'ok' });

    cmp.resend();

    expect(resendVerificationEmail).toHaveBeenCalledOnce();
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/dashboard/profile');
    expect((cmp as unknown as { sending: () => boolean }).sending()).toBe(false);
  });

  it('resend() on 429 surfaces a throttled toast and does NOT navigate', () => {
    const { cmp, messageAdd, navigateByUrl } = setup({ resendResponse: '429' });

    cmp.resend();

    expect(messageAdd).toHaveBeenCalledOnce();
    expect(messageAdd.mock.calls[0][0]).toMatchObject({ severity: 'warn' });
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('resend() on 401 routes to /auth/login (stale token recovery path)', () => {
    const { cmp, navigateByUrl, messageAdd } = setup({ resendResponse: '401' });

    cmp.resend();

    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/auth/login');
    expect(messageAdd).not.toHaveBeenCalled();
  });

  it('resend() on a generic error surfaces an error toast', () => {
    const { cmp, messageAdd, navigateByUrl } = setup({ resendResponse: 'generic' });

    cmp.resend();

    expect(messageAdd).toHaveBeenCalledOnce();
    expect(messageAdd.mock.calls[0][0]).toMatchObject({ severity: 'error' });
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('resend() is a no-op when canResend is false (no token) — guards the click', () => {
    const { cmp, resendVerificationEmail } = setup({ hasToken: false });

    cmp.resend();

    expect(resendVerificationEmail).not.toHaveBeenCalled();
  });

  it('resend() is a no-op while a previous resend is in flight (re-entrancy guard)', () => {
    // Use EMPTY so the first call neither completes nor errors during the test.
    const getToken = vi.fn(() => 'tok');
    const resendVerificationEmail = vi.fn(() => EMPTY);
    const navigateByUrl = vi.fn(() => Promise.resolve(true));
    const messageAdd = vi.fn();

    TestBed.configureTestingModule({
      imports: [VerifyErrorComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { getToken, resendVerificationEmail } as unknown as AuthService,
        },
        { provide: Router, useValue: { navigateByUrl } as Partial<Router> },
        { provide: MessageService, useValue: { add: messageAdd } as Partial<MessageService> },
        ...provideI18nTesting(),
      ],
    });

    const fixture = TestBed.createComponent(VerifyErrorComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.resend();
    cmp.resend();
    cmp.resend();

    expect(resendVerificationEmail).toHaveBeenCalledOnce();
  });

  it('goToLogin() navigates to /auth/login', () => {
    const { cmp, navigateByUrl } = setup();

    cmp.goToLogin();

    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/auth/login');
  });
});
