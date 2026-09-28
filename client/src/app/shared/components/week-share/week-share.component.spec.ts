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

/** The menu is one group: its label says which week goes out, or why none does. */
function menu(fixture: { componentInstance: WeekShareComponent }): MenuItem {
  const [group] = (fixture.componentInstance as unknown as { items(): MenuItem[] }).items();
  return group;
}

function actions(fixture: { componentInstance: WeekShareComponent }): MenuItem[] {
  return menu(fixture).items ?? [];
}

function sharedText(whatsapp: MenuItem): string {
  return decodeURIComponent(whatsapp.url!.split('text=')[1]);
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
    // Drawn while the programme loads: a button that turns up late moves the
    // page's primary action under the pointer.
    expect(fixture.nativeElement.querySelector('[data-cy="week-share"]')).not.toBeNull();
    expect(menu(fixture).label).toBe('Loading the week…');

    httpMock.expectOne((r) => r.url === URL).flush({ data: calendar() });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-cy="week-share"]',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(menu(fixture).label).toBe('The week of 12 Oct');

    const [copy, whatsapp] = actions(fixture);
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

  it('spins while the programme loads, the ways to send disabled till it answers', () => {
    const { fixture, httpMock } = setup([MONDAY, FRIDAY]);
    expect(menu(fixture).icon).toBe('pi pi-spinner pi-spin');
    expect(actions(fixture).every((item) => item.disabled)).toBe(true);

    // Drawn by the menu's own heading, where the week will be, hidden from readers.
    (fixture.nativeElement.querySelector('[data-cy="week-share"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const spinner = document.body.querySelector('.p-menu-submenu-label .pi-spinner');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    expect(spinner?.parentElement?.textContent).toContain('Loading the week…');

    httpMock.expectOne((r) => r.url === URL).flush({ data: calendar() });
    fixture.detectChanges();

    expect(menu(fixture).icon).toBeUndefined();
    expect(document.body.querySelector('.p-menu-submenu-label .pi-spinner')).toBeNull();
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

    expect(sharedText(actions(fixture)[1])).toBe("The week's plan\nFri 16 · closed — Festa");
  });

  it('sends the restart week, though it runs into the season the programme does not hold yet', () => {
    // Sunday 29 August 2027, evening; the season ends on Tuesday the 31st.
    vi.setSystemTime(new Date(2027, 7, 29, 21, 30));
    const { fixture, httpMock } = setup([MONDAY, FRIDAY]);
    httpMock
      .expectOne((r) => r.url === URL)
      .flush({
        data: calendar({
          season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
          today: '2027-08-29',
        }),
      });
    fixture.detectChanges();

    expect(menu(fixture).label).toBe('The week of 30 Aug');
    expect(sharedText(actions(fixture)[1])).toBe(
      "The week's plan\nMon 30 · 19:00 Fundamentals\nFri 3 · Open mat",
    );
  });

  it('says why when there is no week to send, and sends nothing', () => {
    const { fixture, httpMock } = setup([]);
    httpMock.expectOne((r) => r.url === URL).flush({ data: calendar() });
    fixture.detectChanges();

    // Still drawn: an action that vanishes teaches nobody that it exists.
    expect(fixture.nativeElement.querySelector('[data-cy="week-share"]')).not.toBeNull();
    expect(menu(fixture).label).toBe('Nothing on the timetable this week or the next.');
    const [copy, whatsapp] = actions(fixture);
    expect(copy.disabled).toBe(true);
    expect(whatsapp.disabled).toBe(true);
    expect(whatsapp.url).toBeUndefined();
  });

  it('says the programme did not load, and tries again from the menu', () => {
    const { fixture, httpMock } = setup([MONDAY, FRIDAY]);
    httpMock.expectOne((r) => r.url === URL).flush('', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="week-share"]')).not.toBeNull();
    expect(menu(fixture).label).toBe("The programme didn't load.");
    const [retry] = actions(fixture);
    expect(retry.label).toBe('Try again');

    retry.command?.({});
    expect(menu(fixture).label).toBe('Loading the week…');
    httpMock.expectOne((r) => r.url === URL).flush({ data: calendar() });
    fixture.detectChanges();

    expect(menu(fixture).label).toBe('The week of 12 Oct');
  });
});
