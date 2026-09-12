import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { AthleteSyllabusCoverage } from '../../../../core/services/stats.service';
import { AthleteSyllabusCoverageComponent } from './athlete-syllabus-coverage.component';

const ATHLETE_ID = 42;
const URL = `/api/v1/athletes/${ATHLETE_ID}/syllabus-coverage`;

function report(over: Partial<AthleteSyllabusCoverage> = {}): AthleteSyllabusCoverage {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    joined_on: '2026-09-01',
    totals: {
      taught_by_academy: 4,
      seen: 2,
      thin: 1,
      missed: 1,
      percentage: 50,
      not_taught_yet: 0,
    },
    missed: [],
    seen_lately: [],
    unattributed_presences: 0,
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [AthleteSyllabusCoverageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          parent: { paramMap: of(convertToParamMap({ id: String(ATHLETE_ID) })) },
        },
      },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(AthleteSyllabusCoverageComponent);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

function flush(httpMock: HttpTestingController, body: AthleteSyllabusCoverage): void {
  httpMock.expectOne((r) => r.url === URL).flush({ data: body });
}

describe('AthleteSyllabusCoverageComponent (#1567)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for this athlete, from the current season', () => {
    const { httpMock } = setup();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('seasons_back')).toBe('0');
    req.flush({ data: report() });
  });

  it('leads with what they caught of what actually happened', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, report());
    fixture.detectChanges();

    const headline = fixture.nativeElement.querySelector('[data-cy="athlete-coverage-headline"]');
    expect(headline.textContent).toContain('50');
    // The denominator is what the academy taught, never the whole syllabus.
    expect(fixture.nativeElement.textContent).toContain('2 of 4 things the academy taught');
  });

  it('keeps what nobody taught out of the number and says whose gap it is', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      report({
        totals: {
          taught_by_academy: 4,
          seen: 2,
          thin: 1,
          missed: 1,
          percentage: 50,
          not_taught_yet: 30,
        },
      }),
    );
    fixture.detectChanges();

    // Thirty untaught topics must not drag a person's number down: that is a
    // decision about the programme, and saying so is the whole design.
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-coverage-headline"]').textContent,
    ).toContain('50');
    const note = fixture.nativeElement.querySelector('[data-cy="athlete-coverage-not-taught"]');
    expect(note.textContent).toContain("academy's gap, not theirs");
  });

  it('says what it cannot attribute rather than counting it as absence', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, report({ unattributed_presences: 3 }));
    fixture.detectChanges();

    const caveat = fixture.nativeElement.querySelector('[data-cy="athlete-coverage-caveat"]');
    expect(caveat.textContent).toContain('3');
  });

  it('hides the caveat when there is nothing to caveat', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock, report());
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="athlete-coverage-caveat"]')).toBeNull();
  });

  it('lists what they missed with how many chances they had', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      report({
        missed: [
          {
            id: 11,
            name: 'Guard retention',
            parent_name: 'Closed guard',
            kind: 'both',
            taught_times: 3,
          },
        ],
      }),
    );
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-cy="athlete-coverage-missed"]');
    expect(panel.textContent).toContain('Guard retention');
    expect(panel.textContent).toContain('Closed guard');
    // "You were out that night" and "you keep missing this" differ.
    expect(panel.textContent).toContain('3');
  });

  it('lists what they have seen, with how long ago', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      report({
        seen_lately: [
          {
            id: 12,
            name: 'Armbar',
            parent_name: 'Closed guard',
            lessons: 2,
            last_seen_on: '2026-03-12',
          },
        ],
      }),
    );
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-cy="athlete-coverage-seen"]');
    expect(panel.textContent).toContain('Armbar');
    expect(panel.textContent).toContain('12 Mar');
  });

  it('points at the programme when the academy has none', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      report({
        totals: {
          taught_by_academy: 0,
          seen: 0,
          thin: 0,
          missed: 0,
          percentage: 0,
          not_taught_yet: 0,
        },
      }),
    );
    fixture.detectChanges();

    // No percentage on a person when there is nothing to measure against.
    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-coverage-no-programme"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-coverage-headline"]')).toBeNull();
  });

  it('says nothing has happened yet rather than that they missed everything', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      report({
        joined_on: '2026-11-01',
        totals: {
          taught_by_academy: 0,
          seen: 0,
          thin: 0,
          missed: 0,
          percentage: 0,
          not_taught_yet: 12,
        },
      }),
    );
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector(
      '[data-cy="athlete-coverage-nothing-taught"]',
    );
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain('1 Nov');
    expect(fixture.nativeElement.querySelector('[data-cy="athlete-coverage-headline"]')).toBeNull();
  });

  it('offers a way back when the read fails', () => {
    const { fixture, httpMock } = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-coverage-error"]'),
    ).not.toBeNull();

    fixture.componentInstance['retry']();
    fixture.detectChanges();
    flush(httpMock, report());
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="athlete-coverage-headline"]'),
    ).not.toBeNull();
  });
});
