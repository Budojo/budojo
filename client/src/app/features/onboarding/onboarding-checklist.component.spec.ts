import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { OnboardingService, OnboardingStep } from '../../core/services/onboarding.service';
import { OnboardingChecklistComponent } from './onboarding-checklist.component';

/**
 * Tests for the dashboard "Getting started" checklist (#424).
 *
 * The component is rendered conditionally by the parent (athletes-list);
 * here we cover its own behaviour: the row CTA navigates AND fires
 * completeStep, dismiss prompts confirmation, completed steps render
 * the `--done` modifier on the matching `[data-cy="onboarding-step-*"]`.
 */
describe('OnboardingChecklistComponent (#588)', () => {
  let fixture: ComponentFixture<OnboardingChecklistComponent>;
  let router: Router;
  let onboardingService: OnboardingService;

  /**
   * `tourActive` (and hence `checklistVisible`) is gated on the service
   * having loaded from the server. Flip the private `_loaded` signal
   * so the template actually renders the card.
   */
  function makeTourVisible(): void {
    (onboardingService as unknown as { _loaded: { set(v: boolean): void } })._loaded.set(true);
  }

  function getConfirmationService(): ConfirmationService {
    // The component declares ConfirmationService in its own `providers:
    // [...]`, so it lives in the element injector (one instance per
    // component) — TestBed.inject() looks at the module injector and
    // returns null. Pull it from the fixture's element injector.
    return fixture.debugElement.injector.get(ConfirmationService);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OnboardingChecklistComponent],
      providers: [
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        ...provideI18nTesting(),
        MessageService,
      ],
    });
    fixture = TestBed.createComponent(OnboardingChecklistComponent);
    router = TestBed.inject(Router);
    onboardingService = TestBed.inject(OnboardingService);
    // navigate is async — stubbed to a resolved promise so the
    // tap on `completeStep` runs without an actual route resolution.
    router.navigate = vi.fn().mockResolvedValue(true) as never;
  });

  it('renders the checklist card with one row per onboarding step', () => {
    makeTourVisible();
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('[data-cy="onboarding-checklist"]');
    expect(card).not.toBeNull();
    const rows = fixture.nativeElement.querySelectorAll('[data-cy^="onboarding-step-"]');
    // 5 ONBOARDING_STEPS × (1 row + 1 CTA per row) = 10 matching nodes;
    // narrow to the row-level anchors via the `:not` exclusion.
    const stepRows = fixture.nativeElement.querySelectorAll(
      '[data-cy^="onboarding-step-"]:not([data-cy$="-cta"])',
    );
    expect(stepRows.length).toBe(5);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('marks a step as completed in the DOM when the service signal reports it', () => {
    makeTourVisible();
    onboardingService['_completedSteps'].set(['add_athlete' as OnboardingStep]);
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector(
      '[data-cy="onboarding-step-add_athlete"]',
    ) as HTMLElement;
    expect(row.className).toContain('--done');
  });

  it('routes via Router AND fires completeStep on a step CTA click', () => {
    makeTourVisible();
    const completeSpy = vi
      .spyOn(onboardingService, 'completeStep')
      .mockReturnValue(of(['log_attendance' as OnboardingStep]));
    fixture.detectChanges();

    // PrimeNG buttons emit `(onClick)` as an Output, not a native
    // click bubble — trigger the Angular event handler directly via
    // debugElement.
    const cta = fixture.debugElement.query(
      By.css('[data-cy="onboarding-step-log_attendance-cta"]'),
    );
    cta.triggerEventHandler('onClick', new MouseEvent('click'));

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/attendance']);
    expect(completeSpy).toHaveBeenCalledWith('log_attendance');
  });

  it('swallows completeStep errors silently (the user is being navigated)', () => {
    makeTourVisible();
    const messageSpy = vi.spyOn(TestBed.inject(MessageService), 'add');
    vi.spyOn(onboardingService, 'completeStep').mockReturnValue(
      throwError(() => new Error('boom')),
    );
    fixture.detectChanges();

    const cta = fixture.debugElement.query(By.css('[data-cy="onboarding-step-add_athlete-cta"]'));
    expect(() => cta.triggerEventHandler('onClick', new MouseEvent('click'))).not.toThrow();
    // No error toast — surfacing one on a corner the user is about to
    // leave is noise (component comment).
    expect(messageSpy).not.toHaveBeenCalled();
  });

  it('opens the confirm popup before dismissing', () => {
    makeTourVisible();
    fixture.detectChanges();
    const confirmSpy = vi.spyOn(getConfirmationService(), 'confirm');

    const dismissBtn = fixture.debugElement.query(
      By.css('[data-cy="onboarding-checklist-dismiss"]'),
    );
    dismissBtn.triggerEventHandler('onClick', new MouseEvent('click'));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({ accept: expect.any(Function) }),
    );
  });

  it('fires dismiss() on accept and shows an info toast', () => {
    makeTourVisible();
    fixture.detectChanges();
    const confirmService = getConfirmationService();
    vi.spyOn(confirmService, 'confirm').mockImplementation((opts) => {
      // Simulate the user clicking "Yes, dismiss"
      opts.accept?.();
      return confirmService;
    });
    const dismissSpy = vi
      .spyOn(onboardingService, 'dismiss')
      .mockReturnValue(of('2026-05-21T00:00:00Z'));
    const messageSpy = vi.spyOn(TestBed.inject(MessageService), 'add');

    const dismissBtn = fixture.debugElement.query(
      By.css('[data-cy="onboarding-checklist-dismiss"]'),
    );
    dismissBtn.triggerEventHandler('onClick', new MouseEvent('click'));

    expect(dismissSpy).toHaveBeenCalled();
    expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info' }));
  });
});
