import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LoginComponent } from './login.component';

interface Harness {
  readonly fixture: ComponentFixture<LoginComponent>;
  readonly httpMock: HttpTestingController;
  readonly el: HTMLElement;
}

function setup(): Harness {
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideRouter([{ path: 'dashboard', children: [] }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    el: fixture.nativeElement as HTMLElement,
  };
}

function typeIn(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('LoginComponent — inline validation errors (#1045 reviewer)', () => {
  it('shows the email-required inline error after an empty-form submit', async () => {
    const { fixture, el } = setup();

    // Submit with both fields empty — markAllAsTouched flips touched
    // but does NOT emit on statusChanges. Pre-fix, the computed never
    // re-ran and the error never rendered.
    (fixture.componentInstance as unknown as { submit: () => void }).submit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const errors = Array.from(
      el.querySelectorAll('small.budojo-form-field__error'),
    ) as HTMLElement[];
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const text = errors.map((e) => e.textContent?.trim() ?? '').join(' | ');
    expect(text).toMatch(/required|obbligator/i);
  });
});

describe('LoginComponent — 2FA challenge (#412)', () => {
  it('renders the email/password step by default', () => {
    const { el } = setup();
    expect(el.querySelector('input[type="email"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="auth-login-two-factor-step"]')).toBeNull();
  });

  it('flips to the 2FA step when the server replies 422 two_factor_required', async () => {
    const { fixture, httpMock, el } = setup();
    const component = fixture.componentInstance as unknown as {
      form: {
        controls: {
          email: { setValue: (v: string) => void };
          password: { setValue: (v: string) => void };
        };
      };
      submit: () => void;
    };
    component.form.controls.email.setValue('mario@example.com');
    component.form.controls.password.setValue('Password1!');
    component.submit();
    httpMock
      .expectOne('/api/v1/auth/login')
      .flush(
        { message: 'two_factor_required' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="auth-login-two-factor-step"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="auth-login-two-factor-code"]')).not.toBeNull();
  });

  it('retries with two_factor_code on the second submit', async () => {
    const { fixture, httpMock, el } = setup();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const component = fixture.componentInstance as unknown as {
      form: {
        controls: {
          email: { setValue: (v: string) => void };
          password: { setValue: (v: string) => void };
          two_factor_code: { setValue: (v: string) => void };
        };
      };
      submit: () => void;
    };
    component.form.controls.email.setValue('mario@example.com');
    component.form.controls.password.setValue('Password1!');
    component.submit();
    httpMock
      .expectOne('/api/v1/auth/login')
      .flush(
        { message: 'two_factor_required' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    typeIn(el, '[data-cy="auth-login-two-factor-code"]', '123456');
    component.submit();

    const second = httpMock.expectOne('/api/v1/auth/login');
    expect(second.request.body).toMatchObject({
      email: 'mario@example.com',
      password: 'Password1!',
      two_factor_code: '123456',
    });
    second.flush({ data: { id: 1, role: 'owner' }, token: 'xyz' });
    await fixture.whenStable();
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows codeInvalid error when the server rejects the 2FA code', async () => {
    const { fixture, httpMock, el } = setup();
    const component = fixture.componentInstance as unknown as {
      form: {
        controls: {
          email: { setValue: (v: string) => void };
          password: { setValue: (v: string) => void };
          two_factor_code: { setValue: (v: string) => void };
        };
      };
      submit: () => void;
    };
    component.form.controls.email.setValue('mario@example.com');
    component.form.controls.password.setValue('Password1!');
    component.submit();
    httpMock
      .expectOne('/api/v1/auth/login')
      .flush(
        { message: 'two_factor_required' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    typeIn(el, '[data-cy="auth-login-two-factor-code"]', '000000');
    component.submit();
    httpMock
      .expectOne('/api/v1/auth/login')
      .flush(
        { message: 'invalid_two_factor_code' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="auth-login-two-factor-error"]')).not.toBeNull();
  });
});
