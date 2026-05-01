import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthService, User } from '../../../core/services/auth.service';
import { EmailVerificationStatusComponent } from './email-verification-status.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

class FakeAuthService {
  readonly user = signal<User | null>(null);
  readonly isEmailVerified = signal(false);
  readonly resendVerificationEmail = vi.fn();
}

function userFactory(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: 'Mario Rossi',
    email: 'mario@example.com',
    email_verified_at: null,
    ...overrides,
  };
}

describe('EmailVerificationStatusComponent', () => {
  let auth: FakeAuthService;
  let addSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [EmailVerificationStatusComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
        { provide: AuthService, useClass: FakeAuthService },
        ...provideI18nTesting(),
      ],
    });
    auth = TestBed.inject(AuthService) as unknown as FakeAuthService;
    addSpy = vi.spyOn(TestBed.inject(MessageService), 'add');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render() {
    const fixture = TestBed.createComponent(EmailVerificationStatusComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing when there is no user yet', () => {
    auth.user.set(null);
    const fixture = render();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="email-verification-status"]'),
    ).toBeNull();
  });

  it('renders the verified state when the user has a non-null email_verified_at', () => {
    auth.user.set(userFactory({ email_verified_at: '2026-04-28T15:00:00+00:00' }));
    auth.isEmailVerified.set(true);
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.verification-status--verified')).not.toBeNull();
    expect(el.textContent).toContain('Email verified');
    expect(el.querySelector('[data-cy="email-verification-resend"]')).toBeNull();
  });

  it('renders the unverified state and exposes a resend button', () => {
    auth.user.set(userFactory({ email_verified_at: null }));
    auth.isEmailVerified.set(false);
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.verification-status--unverified')).not.toBeNull();
    expect(el.querySelector('[data-cy="email-verification-resend"]')).not.toBeNull();
  });

  it('calls resendVerificationEmail and shows a success toast on success', () => {
    auth.user.set(userFactory({ email_verified_at: null }));
    auth.isEmailVerified.set(false);
    auth.resendVerificationEmail.mockReturnValue(of(undefined));

    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="email-verification-resend"] button',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(auth.resendVerificationEmail).toHaveBeenCalledOnce();
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: 'Email sent' }),
    );
  });

  it('shows a warn toast and starts cooldown on a 429 throttle response', () => {
    auth.user.set(userFactory({ email_verified_at: null }));
    auth.isEmailVerified.set(false);
    auth.resendVerificationEmail.mockReturnValue(throwError(() => ({ status: 429 })));

    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="email-verification-resend"] button',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: 'Try again in a moment' }),
    );

    const labelAfterClick = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="email-verification-resend"] button',
    )?.textContent;
    expect(labelAfterClick).toMatch(/Resend in \d+s/);
  });

  it('shows an error toast on a non-429 failure', () => {
    auth.user.set(userFactory({ email_verified_at: null }));
    auth.isEmailVerified.set(false);
    auth.resendVerificationEmail.mockReturnValue(throwError(() => ({ status: 500 })));

    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="email-verification-resend"] button',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', summary: 'Couldn’t send email' }),
    );
  });
});
