import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
