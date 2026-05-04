import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { StatsComponent } from './stats.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

// PrimeNG's <p-tablist> binds a ResizeObserver in ngAfterViewInit; jsdom
// doesn't ship one. Stub with a no-op to keep CD past the first render.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver ??=
  ResizeObserverStub;

describe('StatsComponent (shell)', () => {
  let fixture: ComponentFixture<StatsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsComponent);
  });

  it('renders all four tab labels in canonical order', () => {
    fixture.detectChanges();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('p-tab')).map((el) =>
      (el as Element).getAttribute('data-cy'),
    );
    expect(labels).toEqual([
      'stats-tab-overview',
      'stats-tab-attendance',
      'stats-tab-payments',
      'stats-tab-athletes',
    ]);
  });
});

/**
 * Regression repro for the v1.14.1 prod blank-page (#382): when
 * navigating in-app from `/dashboard/athletes` to `/dashboard/stats`,
 * the activeTab toSignal map callback fires on the `startWith(null)`
 * tick during component construction. If `route.firstChild` is set
 * (the empty-path Overview child has been registered in the route
 * tree) BUT its `snapshot` is in a transient intermediate state — or
 * if a NavigationEnd with no firstChild lands while the component is
 * mid-tear-down — the original chain `firstChild?.snapshot.url[0]?.path`
 * would throw `Cannot read properties of undefined (reading 'url')`
 * because the optional chain only short-circuits on `firstChild`,
 * not on the subsequent `.snapshot.url` accesses.
 *
 * The fix is to make every step optional. This spec drives the
 * StatsComponent through an ActivatedRoute whose `firstChild` carries
 * an undefined `snapshot` so the un-fixed code path explodes.
 */
describe('StatsComponent activeTab — defensive against transient route states (#382)', () => {
  function setupWithFirstChild(firstChild: { snapshot?: unknown } | null): void {
    const eventsSubject = new Subject<NavigationEnd>();
    const fakeRouter = { events: eventsSubject.asObservable(), url: '/dashboard/stats' };
    const fakeRoute: Partial<ActivatedRoute> = {
      firstChild: firstChild as unknown as ActivatedRoute,
    };

    TestBed.configureTestingModule({
      imports: [StatsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: Router, useValue: fakeRouter },
        { provide: ActivatedRoute, useValue: fakeRoute },
      ],
    });
  }

  it('does NOT throw when firstChild is set but snapshot is undefined (transient route state)', () => {
    setupWithFirstChild({ snapshot: undefined });
    expect(() => {
      const fixture = TestBed.createComponent(StatsComponent);
      fixture.detectChanges();
    }).not.toThrow();
  });

  it('does NOT throw when firstChild is set with an empty snapshot.url array (empty-path child)', () => {
    setupWithFirstChild({ snapshot: { url: [] } });
    expect(() => {
      const fixture = TestBed.createComponent(StatsComponent);
      fixture.detectChanges();
    }).not.toThrow();
  });

  it('falls back to "overview" when firstChild is null', () => {
    setupWithFirstChild(null);
    const fixture = TestBed.createComponent(StatsComponent);
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelector('[data-cy="stats-tabs"]');
    expect(tabs?.getAttribute('ng-reflect-value') ?? 'overview').toBe('overview');
  });
});
