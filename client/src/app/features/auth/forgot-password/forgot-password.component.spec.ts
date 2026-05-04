import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ForgotPasswordComponent } from './forgot-password.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('ForgotPasswordComponent (#280 / M5 PR-A)', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let component: ForgotPasswordComponent;
  let forgotSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    forgotSpy = vi.fn().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        { provide: AuthService, useValue: { forgotPassword: forgotSpy } },
      ],
    });
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts invalid with an empty email', () => {
    expect(component.form.invalid).toBe(true);
    expect(component.submitted()).toBe(false);
  });

  it('blocks submit and does not call the service when the email is empty', () => {
    component.submit();
    expect(forgotSpy).not.toHaveBeenCalled();
    expect(component.submitted()).toBe(false);
  });

  it('blocks submit when the email is malformed', () => {
    component.form.patchValue({ email: 'not-an-email' });
    component.submit();
    expect(forgotSpy).not.toHaveBeenCalled();
  });

  it('calls AuthService.forgotPassword and surfaces the optimistic success state', () => {
    component.form.patchValue({ email: 'mario@example.com' });
    component.submit();

    expect(forgotSpy).toHaveBeenCalledWith({ email: 'mario@example.com' });
    expect(component.submitted()).toBe(true);
  });

  it('renders the success panel after the optimistic submit lands', () => {
    component.form.patchValue({ email: 'mario@example.com' });
    component.submit();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-cy="forgot-password-sent"]');
    expect(panel).not.toBeNull();
  });

  it('treats a 429 throttle response as success (same UX as success — defeats enumeration)', () => {
    forgotSpy.mockReturnValueOnce(throwError(() => ({ status: 429 })));

    component.form.patchValue({ email: 'mario@example.com' });
    component.submit();

    expect(component.submitted()).toBe(true);
    expect(component['error']()).toBeNull();
  });

  it('surfaces a generic error on any non-429 transport failure', () => {
    forgotSpy.mockReturnValueOnce(throwError(() => ({ status: 500 })));

    component.form.patchValue({ email: 'mario@example.com' });
    component.submit();

    expect(component.submitted()).toBe(false);
    expect(component['error']()).toBe('auth.forgotPassword.errorGeneric');
  });

  it('exposes a Back to sign in link pointing at /auth/login', () => {
    const link = fixture.nativeElement.querySelector(
      '[data-cy="forgot-password-back-to-login"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('routerLink')).toBe('/auth/login');
  });
});
