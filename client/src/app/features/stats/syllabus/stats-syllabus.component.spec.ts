import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { SyllabusCoverage } from '../../../core/services/stats.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { StatsSyllabusComponent } from './stats-syllabus.component';

const URL = '/api/v1/stats/syllabus/coverage';

function report(over: Partial<SyllabusCoverage> = {}): SyllabusCoverage {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    totals: { in_scope: 10, covered: 4, thin: 2, missing: 4, percentage: 40 },
    positions: [
      {
        id: 1,
        name: 'Closed guard',
        kind: 'both',
        in_scope: 6,
        covered: 3,
        thin: 1,
        missing: 2,
        worked: 0,
      },
      {
        id: 2,
        name: 'Half guard',
        kind: 'both',
        in_scope: 4,
        covered: 1,
        thin: 1,
        missing: 2,
        worked: 2,
      },
    ],
    missing: [
      { id: 31, name: 'Omoplata', parent_name: 'Closed guard', kind: 'both' },
      { id: 32, name: 'Lockdown', parent_name: 'Half guard', kind: 'nogi' },
    ],
    taught: [
      {
        id: 11,
        name: 'Armbar',
        parent_name: 'Closed guard',
        kind: 'both',
        lessons: 3,
        last_taught_on: '2026-10-05',
        state: 'covered',
      },
      {
        id: 12,
        name: 'Triangle',
        parent_name: 'Closed guard',
        kind: 'both',
        lessons: 1,
        last_taught_on: '2026-09-07',
        state: 'thin',
      },
    ],
    timeline: [
      { on: '2026-09-06', covered: 0 },
      { on: '2026-09-13', covered: 2 },
    ],
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [StatsSyllabusComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(StatsSyllabusComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, httpMock };
}

function flush(httpMock: HttpTestingController, data: SyllabusCoverage = report()) {
  const req = httpMock.expectOne((r) => r.url === URL);
  req.flush({ data });
  return req;
}

describe('StatsSyllabusComponent (#1565)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for the current season and everything, before any filter is touched', () => {
    const { httpMock } = setup();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('seasons_back')).toBe('0');
    expect(req.request.params.has('kind')).toBe(false);
    req.flush({ data: report() });
  });

  it('leads with the percentage and the fraction behind it', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-cy="syllabus-coverage-percentage"]')?.textContent?.trim(),
    ).toContain('40');
    // The fraction is what makes the percentage mean something.
    expect(el.textContent).toContain('4 of 10 covered this season');
  });

  it('splits the tally three ways, because one number would hide the thin half', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const totals = fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-totals"]');
    expect(totals.textContent).toContain('4 covered');
    expect(totals.textContent).toContain('2 taught once');
    expect(totals.textContent).toContain('4 not taught');
  });

  it('draws a bar per position, sized by that position own scope', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector(
      '[data-cy="syllabus-position-1"]',
    ) as HTMLElement;
    expect(row.textContent).toContain('Closed guard');
    expect(row.textContent).toContain('3/6');

    const covered = row.querySelector('.bar__seg--covered') as HTMLElement;
    const thin = row.querySelector('.bar__seg--thin') as HTMLElement;
    expect(covered.style.width).toBe('50%');
    expect(thin.style.width).toBe(`${(1 / 6) * 100}%`);
  });

  it('says when a position was worked as a whole, and stays quiet when it was not', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-cy="syllabus-position-2"]')?.textContent?.replace(/\s+/g, ' '),
    ).toContain('worked 2×');
    expect(el.querySelector('[data-cy="syllabus-position-1"]')?.textContent).not.toContain(
      'worked',
    );
  });

  it('lists what has not been taught, with the position it belongs to', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const missing = fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-missing"]');
    expect(missing.textContent).toContain('Not taught yet (2)');
    expect(missing.textContent).toContain('Omoplata');
    expect(missing.textContent).toContain('Closed guard');
  });

  it('answers when each topic was last on the mat, and how long ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 19)); // 19 October 2026
    try {
      const { fixture, httpMock } = setup();
      flush(httpMock);
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector(
        '[data-cy="syllabus-taught-11"]',
      ) as HTMLElement;
      // 5 October → two weeks before 19 October.
      expect(row.textContent?.replace(/\s+/g, ' ')).toContain('2 weeks ago');
      // Taught once carries its own mark, so "last taught" does not read as
      // "done".
      const thinRow = fixture.nativeElement.querySelector('[data-cy="syllabus-taught-12"]');
      expect(thinRow.textContent).toContain('Once');
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-asks with the filter, and narrows both halves of the fraction', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    component['setKind']('nogi');

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('kind')).toBe('nogi');
    req.flush({
      data: report({
        kind: 'nogi',
        totals: { in_scope: 3, covered: 1, thin: 0, missing: 2, percentage: 33 },
      }),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('1 of 3 covered this season');
  });

  it('walks back a season and forward again, and will not go past the current one', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    // Forward from the current season is nowhere to go.
    const next = fixture.nativeElement.querySelector(
      '[data-cy="syllabus-coverage-next"]',
    ) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    component['shiftSeason'](1);
    const back = httpMock.expectOne((r) => r.url === URL);
    expect(back.request.params.get('seasons_back')).toBe('1');
    back.flush({
      data: report({ season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' } }),
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-season"]').textContent,
    ).toContain('2025/26');
  });

  it('tells an academy with no programme what to do instead of showing it a 0%', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      report({
        totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
        positions: [],
        missing: [],
        taught: [],
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-coverage-no-programme"]')).not.toBeNull();
    // "0%" against nothing is not a score — the headline is gone entirely.
    expect(el.querySelector('[data-cy="syllabus-coverage-percentage"]')).toBeNull();
    expect(
      el.querySelector('[data-cy="syllabus-coverage-programme-link"]')?.getAttribute('href'),
    ).toBe('/dashboard/academy/syllabus');
    // No bars, no lists — there is nothing to measure against.
    expect(el.querySelector('[data-cy="syllabus-coverage-positions"]')).toBeNull();
  });

  it('tells an academy with a programme and no lessons to go and teach', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, report({ taught: [] }));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="syllabus-coverage-nothing-taught"]')).not.toBeNull();
    // The tally still shows: "0 covered, 10 not taught" is the honest state.
    expect(el.querySelector('[data-cy="syllabus-coverage-totals"]')).not.toBeNull();
  });

  it('says nothing is missing rather than drawing an empty list', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, report({ missing: [] }));
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-nothing-missing"]'),
    ).not.toBeNull();
  });

  it('offers a retry when the read fails', () => {
    const { fixture, httpMock } = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="syllabus-coverage-error"]'),
    ).not.toBeNull();

    fixture.componentInstance['retry']();
    flush(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="syllabus-coverage"]')).not.toBeNull();
  });

  it('scales the timeline against the denominator, not against its own peak', () => {
    const { fixture, component, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const options = component['timelineOptions']() as { scales: { y: { suggestedMax: number } } };
    expect(options.scales.y.suggestedMax).toBe(10);
    expect(component['timelineData']().datasets[0].data).toEqual([0, 2]);
  });
});
