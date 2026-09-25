import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsAthletesComponent } from './stats-athletes.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { useLadder } from '../../../../test-utils/ladder-test';

const MOCK_BANDS_PAYLOAD = {
  bands: [
    { code: 'junior', category: 'kids', min: 13, max: 15, count: 5 },
    { code: 'adult', category: 'adults', min: 18, max: null, count: 20 },
    { code: 'master_1', category: 'adults', min: 30, max: 35, count: 12 },
  ],
  total: 37,
  missing_dob: 2,
};

describe('StatsAthletesComponent', () => {
  let fixture: ComponentFixture<StatsAthletesComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsAthletesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsAthletesComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders the chart and scope toolbar after data loads with non-zero bands', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({ data: MOCK_BANDS_PAYLOAD });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-chart"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-scope"]')).toBeTruthy();
  });

  it('shows the missing-dob hint only when missing_dob > 0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({ data: MOCK_BANDS_PAYLOAD });
    fixture.detectChanges();

    const hint = fixture.nativeElement.querySelector('[data-cy="stats-athletes-missing"]');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('2');
  });

  it('does not show the missing-dob hint when missing_dob is 0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({
      data: { ...MOCK_BANDS_PAYLOAD, missing_dob: 0 },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-missing"]')).toBeFalsy();
  });

  it('shows the empty state when total === 0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({
      data: { bands: [], total: 0, missing_dob: 0 },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-empty"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-chart"]')).toBeFalsy();
  });

  it('shows the loading skeleton while fetching', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-loading"]')).toBeTruthy();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({ data: MOCK_BANDS_PAYLOAD });
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-error"]')).toBeTruthy();
  });
});

describe('StatsAthletesComponent — the federation the divisions come from (#1807)', () => {
  let fixture: ComponentFixture<StatsAthletesComponent>;
  let http: HttpTestingController;

  function open(art: 'bjj' | 'judo', bands: object[]): HTMLElement {
    TestBed.configureTestingModule({
      imports: [StatsAthletesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    });
    useLadder(art);
    fixture = TestBed.createComponent(StatsAthletesComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/stats/athletes/age-bands')
      .flush({ data: { bands, total: 3, missing_dob: 0 } });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it("titles and labels a judo academy's chart in FIJLKAM classes", () => {
    const el = open('judo', [
      { code: 'esordienti_a', category: 'adults', min: 12, max: 12, count: 1 },
      { code: 'seniores', category: 'adults', min: 21, max: 35, count: 2 },
    ]);

    expect(el.querySelector('.stats-athletes__title')?.textContent?.trim()).toBe(
      'Athletes by FIJLKAM age class',
    );
    expect(fixture.componentInstance['chartData']().labels).toEqual(['Esordienti A', 'Seniores']);
  });

  it('keeps the IBJJF title and labels for BJJ', () => {
    const el = open('bjj', [{ code: 'mighty_mite', category: 'kids', min: 4, max: 6, count: 3 }]);

    expect(el.querySelector('.stats-athletes__title')?.textContent?.trim()).toBe(
      'Athletes by IBJJF age division',
    );
    expect(fixture.componentInstance['chartData']().labels).toEqual(['Mighty Mite']);
  });

  it('reads a division it has no words for as its code, never as a raw key', () => {
    open('judo', [{ code: 'master_b', category: 'adults', min: 41, max: 45, count: 3 }]);

    expect(fixture.componentInstance['chartData']().labels).toEqual(['master_b']);
  });
});

describe('StatsAthletesComponent — an academy that does not train kids (#1651)', () => {
  let http: HttpTestingController;

  function open(trainsKids: boolean, bands: object[]): ComponentFixture<StatsAthletesComponent> {
    TestBed.configureTestingModule({
      imports: [StatsAthletesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    });
    useLadder('bjj', { trains_kids: trainsKids });
    const fixture = TestBed.createComponent(StatsAthletesComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/stats/athletes/age-bands')
      .flush({ data: { bands, total: 21, missing_dob: 0 } });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  const BANDS = [
    { code: 'pee_wee', category: 'kids', min: 7, max: 9, count: 0 },
    { code: 'teen', category: 'kids', min: 13, max: 15, count: 1 },
    { code: 'adult', category: 'adults', min: 18, max: null, count: 20 },
  ];

  it('drops the Kids / Adults toggle, which had nothing to switch between', () => {
    const fixture = open(false, BANDS);

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-scope"]')).toBeNull();
  });

  it('leaves out the empty kids divisions, but not one with somebody in it', () => {
    const fixture = open(false, BANDS);

    // A teenager on an adult roster is still counted where they belong.
    const codes = fixture.componentInstance['visibleBands']().map((b: { code: string }) => b.code);
    expect(codes).toEqual(['teen', 'adult']);
  });

  it('keeps the toggle and every division for an academy that trains kids', () => {
    const fixture = open(true, BANDS);

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-scope"]')).toBeTruthy();
    expect(fixture.componentInstance['visibleBands']()).toHaveLength(3);
  });
});
