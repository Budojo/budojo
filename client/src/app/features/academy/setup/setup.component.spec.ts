import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { SetupComponent } from './setup.component';
import { AcademyService } from '../../../core/services/academy.service';
import { MyAthleteService } from '../../../core/services/my-athlete.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

/**
 * Onboarding wizard "Train here too?" step (#751, M7 PR-C of #747 epic).
 * The final step asks the owner whether they also train at their own
 * academy. "Yes" → enroll-self call AFTER create-academy; "Not now"
 * → straight to dashboard.
 */

interface Harness {
  fixture: ReturnType<typeof TestBed.createComponent<SetupComponent>>;
  cmp: SetupComponent;
  createAcademy: ReturnType<typeof vi.fn>;
  enrollMe: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function setup(): Harness {
  const createAcademy = vi.fn(() => of({}));
  const enrollMe = vi.fn(() => of({ enrolled: true, athleteId: 1 }));

  TestBed.configureTestingModule({
    imports: [SetupComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
      { provide: AcademyService, useValue: { create: createAcademy } },
      { provide: MyAthleteService, useValue: { enroll: enrollMe } },
    ],
  });

  const fixture = TestBed.createComponent(SetupComponent);
  const cmp = fixture.componentInstance;
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, cmp, createAcademy, enrollMe, navigate };
}

describe('SetupComponent — train-here step (#751)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the "Do you train here too?" question with both CTAs', () => {
    const { fixture } = setup();
    expect(
      fixture.nativeElement.querySelector('[data-cy="setup-train-here-question"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="setup-train-here-yes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="setup-train-here-no"]')).not.toBeNull();
  });

  it('renders an inline BudojoFormField error on the name field after empty-submit (#1054)', () => {
    const { fixture, cmp } = setup();
    cmp.submit();
    fixture.detectChanges();
    const err = (fixture.nativeElement as HTMLElement).querySelector(
      'small.budojo-form-field__error',
    );
    expect(err?.textContent?.trim()).toBeTruthy();
  });

  it('defaults to "Not now" — no athlete enroll call on submit', () => {
    const { cmp, createAcademy, enrollMe, navigate } = setup();
    cmp['form'].patchValue({ name: 'Test Academy' });
    cmp.submit();
    expect(createAcademy).toHaveBeenCalledTimes(1);
    expect(enrollMe).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('selecting "Yes" → submit chains create-academy + enroll-self before navigate', () => {
    const { cmp, createAcademy, enrollMe, navigate } = setup();
    cmp['form'].patchValue({ name: 'Test Academy' });
    cmp.setTrainHere(true);

    cmp.submit();

    expect(createAcademy).toHaveBeenCalledTimes(1);
    expect(enrollMe).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('enroll-self failure is non-fatal: navigation still happens (reviewer)', () => {
    // Reviewer ask: the comment promised non-fatal handling but the original
    // submit chain leaked enroll errors to the form's error banner. Verify
    // the wizard navigates to /dashboard even when /me/athlete throws.
    const { fixture, cmp, createAcademy, navigate } = setup();
    cmp['form'].patchValue({ name: 'Test Academy' });
    cmp.setTrainHere(true);

    // Override the enroll spy to throw — must be done BEFORE submit().
    const enrollSpy = TestBed.inject(MyAthleteService) as unknown as {
      enroll: ReturnType<typeof vi.fn>;
    };
    enrollSpy.enroll = vi.fn(() => throwError(() => new Error('enroll backend down')));

    cmp.submit();
    fixture.detectChanges();

    expect(createAcademy).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    // Error banner must NOT show — the academy IS created, the only fall-out
    // is the missing self-enrollment which the user can fix later from Profile.
    expect(cmp['error']()).toBeNull();
  });

  it('selecting "Not now" after Yes flips back to no-enroll on submit', () => {
    const { cmp, createAcademy, enrollMe } = setup();
    cmp['form'].patchValue({ name: 'Test Academy' });
    cmp.setTrainHere(true);
    cmp.setTrainHere(false);
    cmp.submit();
    expect(createAcademy).toHaveBeenCalled();
    expect(enrollMe).not.toHaveBeenCalled();
  });
});
