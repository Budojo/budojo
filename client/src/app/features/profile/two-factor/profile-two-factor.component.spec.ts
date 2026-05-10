import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ProfileTwoFactorComponent } from './profile-two-factor.component';

// Stub the qrcode dynamic import — Vitest's jsdom doesn't have
// `<canvas>` and the real library tries to use it during init. The
// component only consumes `toDataURL`'s output as an <img src>, so
// returning a known string is sufficient for the panel assertions.
vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,STUB'),
}));

interface Harness {
  readonly fixture: ComponentFixture<ProfileTwoFactorComponent>;
  readonly httpMock: HttpTestingController;
  readonly el: HTMLElement;
  readonly addToastSpy: ReturnType<typeof vi.fn>;
}

const STATUS_URL = '/api/v1/me/two-factor';

function setup(): Harness {
  const addToastSpy = vi.fn();
  TestBed.configureTestingModule({
    imports: [ProfileTwoFactorComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: MessageService, useValue: { add: addToastSpy } },
      ConfirmationService,
    ],
  });
  TestBed.overrideComponent(ProfileTwoFactorComponent, { set: { providers: [] } });

  const fixture = TestBed.createComponent(ProfileTwoFactorComponent);
  fixture.detectChanges();
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    el: fixture.nativeElement as HTMLElement,
    addToastSpy,
  };
}

describe('ProfileTwoFactorComponent (#412)', () => {
  it('renders the loading panel before the status call resolves', () => {
    const { el, httpMock } = setup();
    expect(el.querySelector('[data-cy="profile-two-factor-loading"]')).not.toBeNull();
    httpMock.expectOne(STATUS_URL).flush({
      data: { enabled: false, pending: false, recovery_codes_remaining: 0 },
    });
  });

  it('shows the "Enable" CTA when no 2FA is configured', () => {
    const { fixture, el, httpMock } = setup();
    httpMock.expectOne(STATUS_URL).flush({
      data: { enabled: false, pending: false, recovery_codes_remaining: 0 },
    });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-two-factor-off"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-two-factor-enable"]')).not.toBeNull();
  });

  it('flips to pending after enrol, rendering the QR + secret + confirm form', async () => {
    const { fixture, el, httpMock } = setup();
    httpMock.expectOne(STATUS_URL).flush({
      data: { enabled: false, pending: false, recovery_codes_remaining: 0 },
    });
    fixture.detectChanges();

    const enableButton = el.querySelector(
      '[data-cy="profile-two-factor-enable"] button',
    ) as HTMLButtonElement;
    enableButton.click();
    httpMock.expectOne(`${STATUS_URL}/enrol`).flush({
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        provisioning_uri: 'otpauth://totp/Budojo:m@example.com?secret=JBSWY3DPEHPK3PXP',
      },
    });
    // Wait for the qrcode mock promise + the resulting signal update.
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-two-factor-pending"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-two-factor-secret"]')?.textContent).toContain(
      'JBSWY3DPEHPK3PXP',
    );
    expect(el.querySelector('[data-cy="profile-two-factor-confirm-form"]')).not.toBeNull();
  });

  it('opens the recovery-codes dialog after a successful confirm', async () => {
    const { fixture, el, httpMock } = setup();
    httpMock.expectOne(STATUS_URL).flush({
      data: { enabled: false, pending: true, recovery_codes_remaining: 0 },
    });
    fixture.detectChanges();

    // Bypass the enrol step — set the enrolment signal directly via
    // an enrol POST so the pending UI is visible with a known secret.
    const component = fixture.componentInstance as unknown as {
      enrolment: { set: (value: { secret: string; provisioning_uri: string } | null) => void };
    };
    component.enrolment.set({
      secret: 'JBSWY3DPEHPK3PXP',
      provisioning_uri: 'otpauth://totp/Budojo:test',
    });
    fixture.detectChanges();

    const codeInput = el.querySelector(
      '[data-cy="profile-two-factor-code-input"]',
    ) as HTMLInputElement;
    codeInput.value = '123456';
    codeInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submit = el.querySelector(
      '[data-cy="profile-two-factor-confirm-submit"] button',
    ) as HTMLButtonElement;
    submit.click();
    httpMock.expectOne(`${STATUS_URL}/confirm`).flush({
      data: { recovery_codes: ['AAAA-1111', 'BBBB-2222'] },
    });
    httpMock.expectOne(STATUS_URL).flush({
      data: { enabled: true, pending: false, recovery_codes_remaining: 8 },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = document.querySelector('[data-cy="profile-two-factor-recovery-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('AAAA-1111');
    expect(dialog!.textContent).toContain('BBBB-2222');
  });

  it('renders the active state with regenerate + disable actions', () => {
    const { fixture, el, httpMock } = setup();
    httpMock.expectOne(STATUS_URL).flush({
      data: { enabled: true, pending: false, recovery_codes_remaining: 5 },
    });
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="profile-two-factor-active"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-two-factor-regenerate"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="profile-two-factor-disable"]')).not.toBeNull();
  });

  it('surfaces the password-wrong error when disable returns 422', async () => {
    const { fixture, el, httpMock } = setup();
    httpMock.expectOne(STATUS_URL).flush({
      data: { enabled: true, pending: false, recovery_codes_remaining: 5 },
    });
    fixture.detectChanges();

    const disableButton = el.querySelector(
      '[data-cy="profile-two-factor-disable"] button',
    ) as HTMLButtonElement;
    disableButton.click();
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      disableForm: { controls: { password: { setValue: (v: string) => void } } };
    };
    component.disableForm.controls.password.setValue('wrong');
    fixture.detectChanges();

    const submit = document.querySelector(
      '[data-cy="profile-two-factor-disable-submit"] button',
    ) as HTMLButtonElement;
    submit.click();
    httpMock
      .expectOne(STATUS_URL)
      .flush({ message: 'invalid_password' }, { status: 422, statusText: 'Unprocessable Entity' });
    fixture.detectChanges();

    expect(document.querySelector('[data-cy="profile-two-factor-disable-error"]')).not.toBeNull();
  });
});
