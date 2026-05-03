import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { StatsOverviewComponent } from './stats-overview.component';
import { Athlete } from '../../../core/services/athlete.service';

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 1,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: null,
    phone_country_code: null,
    phone_national_number: null,
    address: null,
    date_of_birth: null,
    belt: 'blue',
    stripes: 0,
    status: 'active',
    joined_at: '2024-09-01',
    created_at: '2024-09-01T10:00:00+00:00',
    ...overrides,
  } as Athlete;
}

function makeListResponse(data: Athlete[], lastPage = 1) {
  return {
    data,
    meta: {
      total: data.length,
      current_page: 1,
      per_page: 20,
      last_page: lastPage,
    },
  };
}

function setupTestBed(): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [StatsOverviewComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
  });
  return TestBed.inject(HttpTestingController);
}

describe('StatsOverviewComponent', () => {
  it('renders the empty state when the academy has no athletes', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(StatsOverviewComponent);
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.endsWith('/athletes') && r.params.get('page') === '1')
      .flush(makeListResponse([], 1));
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('[data-cy="stats-empty"]') as HTMLElement;
    expect(empty).not.toBeNull();
    expect(fixture.componentInstance['totalAthletes']()).toBe(0);
    httpMock.verify();
  });

  it('aggregates the athlete list into belt + status doughnut data on a single-page response', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(StatsOverviewComponent);
    fixture.detectChanges();

    const athletes = [
      makeAthlete({ id: 1, belt: 'blue', status: 'active' }),
      makeAthlete({ id: 2, belt: 'blue', status: 'active' }),
      makeAthlete({ id: 3, belt: 'white', status: 'suspended' }),
      makeAthlete({ id: 4, belt: 'black', status: 'inactive' }),
    ];
    httpMock
      .expectOne((r) => r.url.endsWith('/athletes') && r.params.get('page') === '1')
      .flush(makeListResponse(athletes, 1));
    fixture.detectChanges();

    const beltChart = fixture.componentInstance['beltChartData']();
    // Order follows BELT_ORDER (kids → adults → senior); white precedes
    // blue, blue precedes black.
    expect(beltChart.labels).toEqual(['White', 'Blue', 'Black']);
    expect(beltChart.datasets[0].data).toEqual([1, 2, 1]);

    const statusChart = fixture.componentInstance['statusChartData']();
    expect(statusChart.labels).toEqual(['Active', 'Suspended', 'Inactive']);
    expect(statusChart.datasets[0].data).toEqual([2, 1, 1]);

    expect(fixture.componentInstance['totalAthletes']()).toBe(4);
    httpMock.verify();
  });

  it('iterates pages 2..N when the first response advertises more pages', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(StatsOverviewComponent);
    fixture.detectChanges();

    // Page 1: 2 athletes, lastPage = 3
    httpMock
      .expectOne((r) => r.url.endsWith('/athletes') && r.params.get('page') === '1')
      .flush(
        makeListResponse(
          [
            makeAthlete({ id: 1, belt: 'white', status: 'active' }),
            makeAthlete({ id: 2, belt: 'white', status: 'active' }),
          ],
          3,
        ),
      );
    fixture.detectChanges();

    // Pages 2 and 3 fire next (in parallel via mergeMap)
    httpMock
      .expectOne((r) => r.url.endsWith('/athletes') && r.params.get('page') === '2')
      .flush(makeListResponse([makeAthlete({ id: 3, belt: 'blue', status: 'active' })], 3));
    httpMock
      .expectOne((r) => r.url.endsWith('/athletes') && r.params.get('page') === '3')
      .flush(makeListResponse([makeAthlete({ id: 4, belt: 'black', status: 'inactive' })], 3));
    fixture.detectChanges();

    expect(fixture.componentInstance['totalAthletes']()).toBe(4);
    expect(fixture.componentInstance['beltChartData']().labels).toEqual(['White', 'Blue', 'Black']);
    httpMock.verify();
  });

  it('surfaces the error state when the first page request fails', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(StatsOverviewComponent);
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.endsWith('/athletes') && r.params.get('page') === '1')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-cy="stats-error"]') as HTMLElement;
    expect(error).not.toBeNull();
    expect(fixture.componentInstance['errored']()).toBe(true);
    httpMock.verify();
  });
});
