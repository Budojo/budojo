import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { RegisterComponent } from './register.component';

/**
 * The full feature is covered by Cypress; this spec focuses on the
 * GDPR Art. 13 consent gate added in #219 — the rest of the form
 * was already covered indirectly via the auth E2E suite. The
 * privacy checkbox is a load-bearing legal control, so a unit test
 * that pins its semantics (required-true, blocks submit, link
 * target) is worth a few seconds of CI per run.
 */
describe('RegisterComponent — privacy consent gate (#219)', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let authRegisterSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authRegisterSpy = vi.fn().mockReturnValue(of({}));
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { register: authRegisterSpy } },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = vi.fn().mockResolvedValue(true) as never;
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function fillFormExceptConsent(): void {
    component.form.patchValue({
      name: 'Mario Rossi',
      email: 'mario@example.com',
      password: 'verysafe123',
      password_confirmation: 'verysafe123',
    });
  }

  it('starts with privacy_accepted = false and an invalid form', () => {
    expect(component.privacyAccepted.value).toBe(false);
    expect(component.privacyAccepted.invalid).toBe(true);
    expect(component.form.invalid).toBe(true);
  });

  it('blocks submit when the privacy checkbox is unchecked', () => {
    fillFormExceptConsent();
    expect(component.form.invalid).toBe(true);

    component.submit();

    expect(authRegisterSpy).not.toHaveBeenCalled();
    // markAllAsTouched fires so the inline error becomes visible —
    // affordance per Norman: forbidden actions must signal why.
    expect(component.privacyAccepted.touched).toBe(true);
  });

  it('lets the form submit once the privacy checkbox is checked', () => {
    fillFormExceptConsent();
    component.privacyAccepted.setValue(true);
    expect(component.form.valid).toBe(true);

    component.submit();

    expect(authRegisterSpy).toHaveBeenCalledTimes(1);
    // Consent is NOT sent to the API today — the implicit record is
    // the timestamp of the successful POST itself. If/when the spec
    // grows an explicit `privacy_accepted_at` server-side field, this
    // assertion is the trip-wire that says "now wire it up".
    const payload = authRegisterSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('privacy_accepted');
  });

  it('renders the consent checkbox + the link to /privacy', () => {
    const root: HTMLElement = fixture.nativeElement;

    const checkbox = root.querySelector('[data-cy="privacy-consent-checkbox"]');
    expect(checkbox).toBeTruthy();

    const link = root.querySelector('[data-cy="privacy-consent-link"]') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    // Opens in a new tab so the in-progress form isn't blown away
    // when the user reads the policy.
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toContain('noopener');
  });

  it('renders the discreet privacy + sub-processors footer link', () => {
    const root: HTMLElement = fixture.nativeElement;
    const footPrivacy = root.querySelector('[data-cy="auth-foot-privacy-link"]');
    expect(footPrivacy).toBeTruthy();
    expect(footPrivacy?.textContent?.trim()).toBe('Privacy');
  });
});
