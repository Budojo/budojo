import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MenuItem, MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import type { AcademyClass } from '../../../core/services/academy-class.service';
import { AcademyService } from '../../../core/services/academy.service';
import type { SyllabusCalendar } from '../../../core/services/stats.service';
import { WeekShareComponent } from './week-share.component';

const URL = '/api/v1/stats/syllabus/calendar';

const MONDAY: AcademyClass = {
  id: 7,
  name: 'Fundamentals',
  weekday: 1,
  starts_at: '19:00',
  duration_minutes: 60,
  kind: 'gi',
};
const FRIDAY: AcademyClass = { ...MONDAY, id: 10, weekday: 5, name: 'Open mat', starts_at: null };

/** Wednesday 14 October 2026: Monday is behind, Friday ahead. */
function calendar(over: Partial<SyllabusCalendar> = {}): SyllabusCalendar {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    today: '2026-10-14',
    weeks: [],
    positions: [{ id: 1, name: 'Closed guard', kind: 'both', cells: [] }],
    lessons: [],
    ...over,
  };
}

function setup(classes: readonly AcademyClass[]) {
  TestBed.configureTestingModule({
    imports: [WeekShareComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      MessageService,
      ...provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(WeekShareComponent);
  fixture.componentRef.setInput('classes', classes);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

function items(fixture: { componentInstance: WeekShareComponent }): MenuItem[] {
  return (fixture.componentInstance as unknown as { items(): MenuItem[] }).items();
}

describe('WeekShareComponent (#1940)', () => {
  beforeEach(() => {
    // The owner's clock: Wednesday morning, before any class of the day.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 8, 0));
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('offers the week, and the WhatsApp text is the text it copies', async () => {
    const { fixture, httpMock } = setup([MONDAY, FRIDAY]);
    httpMock.expectOne((r) => r.url === URL).flush({ data: calendar() });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-cy="week-share"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-haspopup')).toBe('menu');

    const [copy, whatsapp] = items(fixture);
    const text = "The week's plan\nFri 16 · Open mat";
    expect(whatsapp.url).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
    expect(whatsapp.target).toBe('_blank');

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const toast = vi.spyOn(TestBed.inject(MessageService), 'add');
    copy.command?.({});
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith(text);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('says a closed day, with the academy’s own label', () => {
    const { fixture, httpMock } = setup([MONDAY, FRIDAY]);
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      closures: [{ id: 1, starts_on: '2026-10-16', ends_on: '2026-10-16', label: 'Festa' }],
    } as never);
    httpMock.expectOne((r) => r.url === URL).flush({ data: calendar() });
    fixture.detectChanges();

    const whatsapp = items(fixture)[1];
    expect(decodeURIComponent(whatsapp.url!.split('text=')[1])).toBe(
      "The week's plan\nFri 16 · closed — Festa",
    );
  });

  it('draws nothing while there is no week to send', () => {
    const { fixture, httpMock } = setup([]);
    httpMock.expectOne((r) => r.url === URL).flush({ data: calendar() });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="week-share"]')).toBeNull();
  });

  it('draws nothing when the calendar cannot be read', () => {
    const { fixture, httpMock } = setup([MONDAY, FRIDAY]);
    httpMock.expectOne((r) => r.url === URL).flush('', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="week-share"]')).toBeNull();
  });
});
