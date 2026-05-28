import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { AcademyService, Academy } from '../../../core/services/academy.service';
import { LanguageService } from '../../../core/services/language.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { SchedulePlannerComponent } from './schedule-planner.component';

function buildAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 1,
    name: 'Test Academy',
    slug: 'test-academy',
    address: null,
    logo_url: null,
    training_days: [1, 3, 5],
    current_schedule: { id: 1, training_days: [1, 3, 5], effective_from: '2026-01-01' },
    next_schedule: null,
    schedules: [{ id: 1, training_days: [1, 3, 5], effective_from: '2026-01-01' }],
    ...overrides,
  };
}

describe('SchedulePlannerComponent', () => {
  let fixture: ComponentFixture<SchedulePlannerComponent>;
  let academyService: AcademyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SchedulePlannerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        {
          provide: LanguageService,
          useValue: { currentLang: signal('en') },
        },
      ],
    });
    academyService = TestBed.inject(AcademyService);
    http = TestBed.inject(HttpTestingController);
    academyService.academy.set(buildAcademy());

    fixture = TestBed.createComponent(SchedulePlannerComponent);
    fixture.detectChanges();
  });

  it('starts in idle state with a "Plan a change" CTA when no next_schedule exists', () => {
    const cta = fixture.debugElement.query(By.css('[data-cy="schedule-planner-start"]'));
    expect(cta).not.toBeNull();
    expect(fixture.debugElement.query(By.css('[data-cy="schedule-planner-pending"]'))).toBeNull();
    expect(fixture.debugElement.query(By.css('[data-cy="schedule-planner-form"]'))).toBeNull();
  });

  it('renders the pending change line when next_schedule exists', () => {
    academyService.academy.set(
      buildAcademy({
        next_schedule: { id: 2, training_days: [2, 4], effective_from: '2026-06-01' },
      }),
    );
    fixture.detectChanges();
    const pending = fixture.debugElement.query(By.css('[data-cy="schedule-planner-pending"]'));
    expect(pending).not.toBeNull();
    const summary = fixture.debugElement.query(
      By.css('[data-cy="schedule-planner-pending-summary"]'),
    );
    expect(summary.nativeElement.textContent).toContain('Tue, Thu');
  });

  it('reveals the form when the start CTA is clicked', () => {
    fixture.componentInstance.startEditing();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-cy="schedule-planner-form"]'))).not.toBeNull();
  });

  it('seeds the form with the current schedule when entering edit mode', () => {
    fixture.componentInstance.startEditing();
    fixture.detectChanges();
    // current_schedule.training_days = [1, 3, 5] in the default fixture
    expect(fixture.componentInstance['form'].controls.training_days.value).toEqual([1, 3, 5]);
  });

  it('POSTs the payload to the schedule endpoint and refreshes the academy on submit', () => {
    fixture.componentInstance.startEditing();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 5);
    fixture.componentInstance['form'].setValue({
      effective_from: tomorrow,
      training_days: [2, 4],
    });
    fixture.componentInstance.submit();

    const req = http.expectOne((r) => r.url.endsWith('/api/v1/academy/schedules'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.training_days).toEqual([2, 4]);
    expect(req.request.body.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    req.flush({
      data: { id: 7, training_days: [2, 4], effective_from: req.request.body.effective_from },
    });

    // scheduleChange triggers a forceRefresh — the test pipe should
    // see the GET fire next.
    const refresh = http.expectOne((r) => r.url.endsWith('/api/v1/academy') && r.method === 'GET');
    refresh.flush({ data: buildAcademy() });

    expect(fixture.componentInstance['editing']()).toBe(false);
  });

  it('maps zero selected days to a null training_days payload', () => {
    fixture.componentInstance.startEditing();
    const future = new Date();
    future.setDate(future.getDate() + 5);
    fixture.componentInstance['form'].setValue({
      effective_from: future,
      training_days: [],
    });
    // Manually drive submit even though the form is required — we want
    // to verify the payload mapping the moment a submit fires. The
    // template's `[disabled]` guard is the user-facing protection.
    fixture.componentInstance['form'].controls.training_days.clearValidators();
    fixture.componentInstance['form'].controls.training_days.updateValueAndValidity();
    fixture.componentInstance.submit();

    const req = http.expectOne((r) => r.url.endsWith('/api/v1/academy/schedules'));
    expect(req.request.body.training_days).toBeNull();
    req.flush({
      data: { id: 1, training_days: null, effective_from: req.request.body.effective_from },
    });
    http
      .expectOne((r) => r.url.endsWith('/api/v1/academy') && r.method === 'GET')
      .flush({
        data: buildAcademy(),
      });
  });
});
