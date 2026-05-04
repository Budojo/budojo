import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { convertToParamMap, ParamMap } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ResetPasswordComponent } from './reset-password.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

function setupWithQueryParams(
  query: { token?: string; email?: string },
  resetReturn: Observable<unknown> = of({ message: 'ok' }),
): {
  fixture: ComponentFixture<ResetPasswordComponent>;
  component: ResetPasswordComponent;
  resetSpy: ReturnType<typeof vi.fn>;
  routerNavigate: ReturnType<typeof vi.fn>;
} {
  const resetSpy = vi.fn().mockReturnValue(resetReturn);
  const paramMap: ParamMap = convertToParamMap(query);

  TestBed.configureTestingModule({
    imports: [ResetPasswordComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideI18nTesting(),
      { provide: AuthService, useValue: { resetPassword: resetSpy } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: paramMap } } },
    ],
  });

  const router = TestBed.inject(Router);
  const routerNavigate = vi.fn().mockResolvedValue(true);
  router.navigate = routerNavigate as never;

  const fixture = TestBed.createComponent(ResetPasswordComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, resetSpy, routerNavigate };
}

describe('ResetPasswordComponent (#280 / M5 PR-A)', () => {
  it('flags the link as invalid when there is no token in the URL', () => {
    const { component, fixture } = setupWithQueryParams({ email: 'mario@example.com' });
    expect(component.tokenInvalid()).toBe(true);

    const banner = fixture.nativeElement.querySelector('[data-cy="reset-password-invalid"]');
    expect(banner).not.toBeNull();

    const requestNew = fixture.nativeElement.querySelector(
      '[data-cy="reset-password-request-new"]',
    ) as HTMLAnchorElement | null;
    expect(requestNew?.getAttribute('routerLink')).toBe('/auth/forgot-password');
  });

  it('flags the link as invalid when there is no email in the URL', () => {
    const { component } = setupWithQueryParams({ token: 'abc' });
    expect(component.tokenInvalid()).toBe(true);
  });

  it('renders the password form when both token and email are present', () => {
    const { component, fixture } = setupWithQueryParams({
      token: 'abc',
      email: 'mario@example.com',
    });
    expect(component.tokenInvalid()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-cy="reset-password-submit"]')).not.toBeNull();
  });

  it('blocks submit when password is shorter than 8 characters', () => {
    const { component, resetSpy } = setupWithQueryParams({
      token: 'abc',
      email: 'mario@example.com',
    });
    component.form.patchValue({ password: 'short', passwordConfirmation: 'short' });

    component.submit();

    expect(resetSpy).not.toHaveBeenCalled();
    expect(component.password.errors?.['minlength']).toBeTruthy();
  });

  it('blocks submit when the two password fields do not match', () => {
    const { component, fixture, resetSpy } = setupWithQueryParams({
      token: 'abc',
      email: 'mario@example.com',
    });
    component.form.patchValue({
      password: 'NewPassword1!',
      passwordConfirmation: 'DifferentPassword1!',
    });
    component.form.markAllAsTouched();
    fixture.detectChanges();

    component.submit();

    expect(resetSpy).not.toHaveBeenCalled();
    expect(component.form.errors?.['passwordsMismatch']).toBe(true);

    const mismatch = fixture.nativeElement.querySelector('[data-cy="reset-password-mismatch"]');
    expect(mismatch).not.toBeNull();
  });

  it('calls AuthService.resetPassword with the URL token + email + form password', () => {
    const { component, resetSpy } = setupWithQueryParams({
      token: 'abc-token',
      email: 'mario@example.com',
    });
    component.form.patchValue({
      password: 'NewPassword1!',
      passwordConfirmation: 'NewPassword1!',
    });

    component.submit();

    expect(resetSpy).toHaveBeenCalledWith({
      email: 'mario@example.com',
      token: 'abc-token',
      password: 'NewPassword1!',
      password_confirmation: 'NewPassword1!',
    });
    expect(component.success()).toBe(true);
  });

  it('redirects to /auth/login pre-filled with the email after a successful reset', () => {
    vi.useFakeTimers();
    const { component, routerNavigate } = setupWithQueryParams({
      token: 'abc',
      email: 'mario@example.com',
    });
    component.form.patchValue({
      password: 'NewPassword1!',
      passwordConfirmation: 'NewPassword1!',
    });

    component.submit();
    vi.advanceTimersByTime(1500);

    expect(routerNavigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { email: 'mario@example.com' },
    });
    vi.useRealTimers();
  });

  it('flips to the invalid-link panel when the server rejects the token (any 422)', () => {
    const { component, fixture } = setupWithQueryParams(
      { token: 'expired', email: 'mario@example.com' },
      throwError(() => ({ status: 422 })),
    );
    component.form.patchValue({
      password: 'NewPassword1!',
      passwordConfirmation: 'NewPassword1!',
    });

    component.submit();
    fixture.detectChanges();

    expect(component.tokenInvalid()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-cy="reset-password-invalid"]'),
    ).not.toBeNull();
  });
});
