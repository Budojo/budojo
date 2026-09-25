import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ExposureAthlete, TopicExposure } from '../../../../core/services/stats.service';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { TopicExposureComponent } from './topic-exposure.component';

const URL = '/api/v1/stats/syllabus/topics/11';

function athlete(over: Partial<ExposureAthlete> & Pick<ExposureAthlete, 'id'>): ExposureAthlete {
  return {
    first_name: 'Anna',
    last_name: 'Bianchi',
    belt: 'blue',
    stripes: 1,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
    status: 'active',
    joined_at: '2026-09-01',
    exposures: 0,
    last_seen_on: null,
    state: 'never',
    ...over,
  };
}

function exposure(over: Partial<TopicExposure> = {}): TopicExposure {
  return {
    topic: {
      id: 11,
      name: 'Armbar',
      parent_name: 'Closed guard',
      kind: 'both',
      in_season: true,
      notes: null,
      video_url: null,
    },
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    lessons: [
      {
        id: 1,
        held_on: '2026-09-16',
        name: 'Fundamentals',
        kind: 'gi',
        starts_at: '19:00',
        headcount: 2,
      },
      {
        id: 2,
        held_on: '2026-09-23',
        name: 'Fundamentals',
        kind: 'gi',
        starts_at: '19:00',
        headcount: 1,
      },
    ],
    athletes: [
      athlete({
        id: 1,
        first_name: 'Anna',
        exposures: 2,
        last_seen_on: '2026-09-23',
        state: 'seen',
      }),
      athlete({
        id: 2,
        first_name: 'Marco',
        exposures: 1,
        last_seen_on: '2026-09-16',
        state: 'thin',
      }),
      athlete({ id: 3, first_name: 'Giulia' }),
      athlete({ id: 4, first_name: 'Aldo', status: 'inactive' }),
    ],
    totals: { lessons: 2, seen: 1, thin: 1, never: 2, unplaced: 0 },
    ...over,
  };
}

function setup(seasonsBack = 0) {
  TestBed.configureTestingModule({
    imports: [TopicExposureComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(TopicExposureComponent);
  fixture.componentRef.setInput('topicId', 11);
  fixture.componentRef.setInput('seasonsBack', seasonsBack);
  fixture.componentRef.setInput('visible', true);
  fixture.detectChanges();

  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

function flush(httpMock: HttpTestingController, data: TopicExposure = exposure()) {
  httpMock.expectOne((r) => r.url === URL).flush({ data });
}

function group(fixture: { nativeElement: HTMLElement }, state: string): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll(
      `[data-cy="exposure-group-${state}"] [data-cy^="exposure-athlete-"]`,
    ),
  ).map((row) => (row as HTMLElement).getAttribute('data-cy') ?? '');
}

describe('TopicExposureComponent (#1745)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for the topic it was opened on, in the season the report is showing', () => {
    const { httpMock } = setup(1);

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('seasons_back')).toBe('1');
    req.flush({ data: exposure() });
  });

  it('names the technique, its position and the season', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const head: HTMLElement = fixture.nativeElement.querySelector('[data-cy="exposure-head"]');
    expect(head.textContent).toContain('Armbar');
    expect(head.textContent).toContain('Closed guard');
    expect(head.textContent).toContain('2026/27');
  });

  it('shows how it is taught here first, when the programme says (#1862)', () => {
    const { fixture, httpMock } = setup();
    const base = exposure();
    flush(
      httpMock,
      exposure({
        topic: {
          ...base.topic,
          notes: 'Start from the S-mount.',
          video_url: 'https://vimeo.com/1',
        },
      }),
    );
    fixture.detectChanges();

    const notebook: HTMLElement = fixture.nativeElement.querySelector(
      '[data-cy="exposure-notebook"]',
    );
    expect(notebook.querySelector('[data-cy="exposure-notes"]')?.textContent).toContain('S-mount');
    const video = notebook.querySelector('[data-cy="exposure-video"]') as HTMLAnchorElement;
    expect(video.getAttribute('href')).toBe('https://vimeo.com/1');
    expect(video.getAttribute('target')).toBe('_blank');
  });

  it('says nothing about how it is taught when the programme says nothing', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="exposure-notebook"]')).toBeNull();
  });

  it('lists the lessons that taught it, with how many were in the room', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-cy^="exposure-lesson-"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Fundamentals');
    expect(rows[0].textContent).toContain('2 people');
    expect(rows[1].textContent).toContain('1 person');
  });

  it('splits the roster three ways, in the order the server sent', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    expect(group(fixture, 'seen')).toEqual(['exposure-athlete-1']);
    expect(group(fixture, 'thin')).toEqual(['exposure-athlete-2']);
    expect(group(fixture, 'never')).toEqual(['exposure-athlete-3', 'exposure-athlete-4']);
  });

  it('draws each person with the belt spine, the way the roster does', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-cy="exposure-athlete-1"]');
    expect(row.querySelector('app-athlete-identity')).not.toBeNull();
    expect(row.textContent).toContain('Anna Bianchi');
  });

  it('labels athletes who are no longer active below the active ones', () => {
    const { fixture, httpMock } = setup();
    flush(httpMock);
    fixture.detectChanges();

    const never: HTMLElement = fixture.nativeElement.querySelector(
      '[data-cy="exposure-group-never"]',
    );
    const label = never.querySelector('[data-cy="exposure-inactive-label"]');
    expect(label?.textContent).toContain('No longer active');
    // The label sits between Giulia (active) and Aldo (inactive).
    const order = Array.from(never.querySelectorAll('[data-cy]')).map((n) =>
      n.getAttribute('data-cy'),
    );
    expect(order.indexOf('exposure-inactive-label')).toBeGreaterThan(
      order.indexOf('exposure-athlete-3'),
    );
    expect(order.indexOf('exposure-inactive-label')).toBeLessThan(
      order.indexOf('exposure-athlete-4'),
    );
  });

  it('says nobody has seen it because nobody taught it, and shows no people and no number', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      exposure({
        lessons: [],
        athletes: [],
        totals: { lessons: 0, seen: 0, thin: 0, never: 0, unplaced: 0 },
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="exposure-nobody-yet"]')?.textContent).toContain(
      'nobody has taught it',
    );
    expect(el.querySelector('[data-cy^="exposure-group-"]')).toBeNull();
    expect(el.textContent).not.toContain('%');
  });

  it('lists the people the record cannot place apart, last, and never under never', () => {
    const { fixture, httpMock } = setup();
    flush(
      httpMock,
      exposure({
        athletes: [
          ...exposure().athletes,
          athlete({ id: 5, first_name: 'Paolo', state: 'unplaced' }),
        ],
        totals: { lessons: 2, seen: 1, thin: 1, never: 2, unplaced: 1 },
      }),
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(group(fixture, 'unplaced')).toEqual(['exposure-athlete-5']);
    expect(group(fixture, 'never')).not.toContain('exposure-athlete-5');
    expect(el.querySelector('[data-cy="exposure-group-unplaced"]')?.textContent).toContain(
      "trained that day, at a lesson the record doesn't name",
    );
    const sections = Array.from(el.querySelectorAll('[data-cy^="exposure-group-"]')).map((s) =>
      s.getAttribute('data-cy'),
    );
    expect(sections.at(-1)).toBe('exposure-group-unplaced');
  });

  it('offers a retry when the read fails', () => {
    const { fixture, httpMock } = setup();
    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // A `<p-button>` host does not fire `onClick`; its inner button does.
    const retry: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-cy="exposure-retry"] button',
    );
    expect(retry).not.toBeNull();
    retry.click();
    fixture.detectChanges();
    flush(httpMock);
  });

  it('does not ask for anything while it is closed', () => {
    TestBed.configureTestingModule({
      imports: [TopicExposureComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        ...provideI18nTesting(),
      ],
    });
    const fixture = TestBed.createComponent(TopicExposureComponent);
    fixture.componentRef.setInput('topicId', 11);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).expectNone((r) => r.url === URL);
  });
});
