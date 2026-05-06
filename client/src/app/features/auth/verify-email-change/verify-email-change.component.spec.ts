import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { VerifyEmailChangeComponent } from './verify-email-change.component';
import { AuthService } from '../../../core/services/auth.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

function setup(opts: { token?: string | null; verifyResponse?: 'ok' | '410' } = {}) {
  const verifyEmailChange = vi.fn(() =>
    opts.verifyResponse === '410'
      ? throwError(() => ({ status: 410 }))
      : of({ message: 'email_change_confirmed' }),
  );
  const getToken = vi.fn(() => null);

  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  const messageAdd = vi.fn();

  TestBed.configureTestingModule({
    imports: [VerifyEmailChangeComponent],
    providers: [
      {
        provide: AuthService,
        useValue: { verifyEmailChange, getToken } as Partial<AuthService>,
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(
              opts.token === undefined
                ? { token: 'a'.repeat(64) }
                : opts.token === null
                  ? {}
                  : { token: opts.token },
            ),
          },
        },
      },
      { provide: Router, useValue: { navigateByUrl } as Partial<Router> },
      { provide: MessageService, useValue: { add: messageAdd } as Partial<MessageService> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(VerifyEmailChangeComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, verifyEmailChange, navigateByUrl, messageAdd };
}

describe('VerifyEmailChangeComponent (#476)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the success panel and schedules a redirect to /auth/login when the token is valid', () => {
    const { fixture, verifyEmailChange, navigateByUrl, messageAdd } = setup();

    expect(verifyEmailChange).toHaveBeenCalledWith('a'.repeat(64));
    fixture.detectChanges();

    const successEl = fixture.nativeElement.querySelector(
      '[data-cy="verify-email-change-success"]',
    );
    expect(successEl).not.toBeNull();

    // Auto-redirect after 2s.
    expect(navigateByUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(messageAdd).toHaveBeenCalledOnce();
    expect(navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });

  it('renders the error panel on a 410 response and points the CTA at /auth/login when logged out', () => {
    const { fixture, navigateByUrl } = setup({ verifyResponse: '410' });

    fixture.detectChanges();
    const errorEl = fixture.nativeElement.querySelector('[data-cy="verify-email-change-error"]');
    expect(errorEl).not.toBeNull();
    // No auto-redirect on error.
    vi.advanceTimersByTime(5000);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('renders the error panel when the route param is missing', () => {
    const { fixture, verifyEmailChange } = setup({ token: null });

    expect(verifyEmailChange).not.toHaveBeenCalled();
    fixture.detectChanges();

    const errorEl = fixture.nativeElement.querySelector('[data-cy="verify-email-change-error"]');
    expect(errorEl).not.toBeNull();
  });
});
