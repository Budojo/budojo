import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { AttendanceMonthHeatmapComponent } from './attendance-month-heatmap.component';

/**
 * Helper: build a Date for the given day in the given month/year.
 * Uses local-time constructor to avoid TZ-shifting.
 */
function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe('AttendanceMonthHeatmapComponent', () => {
  function buildFixture(month: Date, attendedDates: readonly Date[]) {
    TestBed.configureTestingModule({
      imports: [AttendanceMonthHeatmapComponent],
      providers: [...provideI18nTesting()],
    });
    const fixture = TestBed.createComponent(AttendanceMonthHeatmapComponent);
    fixture.componentRef.setInput('month', month);
    fixture.componentRef.setInput('attendedDates', attendedDates);
    fixture.detectChanges();
    return fixture;
  }

  it('lights up the cells for the attended dates', () => {
    // April 2026: attended on Apr 3 and Apr 15.
    const fixture = buildFixture(d(2026, 4, 1), [d(2026, 4, 3), d(2026, 4, 15)]);

    // Filled cells carry data-cy="heatmap-cell-filled".
    const filled = fixture.nativeElement.querySelectorAll(
      '[data-cy="heatmap-cell-filled"]',
    ) as NodeListOf<HTMLElement>;
    expect(filled.length).toBe(2);

    // The day-numbers on the filled cells should be 3 and 15.
    const filledDays = Array.from(filled).map((el) => el.textContent?.trim());
    expect(filledDays).toContain('3');
    expect(filledDays).toContain('15');
  });

  it('renders blank (aria-hidden) cells for days outside the month', () => {
    // February 2026: Mon-first grid — Feb 1 is a Sunday (Mon-first col 6),
    // so the first row has 6 leading blank cells (Mon–Sat) before day 1.
    // Feb 2026 has 28 days; the grid is always 42 cells, so trailing blanks
    // = 42 - 28 - 6 = 8. Total blanks = 14.
    const fixture = buildFixture(d(2026, 2, 1), []);

    const blank = fixture.nativeElement.querySelectorAll(
      '[data-cy="heatmap-cell-blank"]',
    ) as NodeListOf<HTMLElement>;
    expect(blank.length).toBe(14);

    // All blank cells must be aria-hidden.
    blank.forEach((el) => {
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('shows the empty-state message when no sessions are recorded', () => {
    const fixture = buildFixture(d(2026, 4, 1), []);

    const empty = fixture.nativeElement.querySelector(
      '[data-cy="heatmap-empty"]',
    ) as HTMLElement | null;
    expect(empty).not.toBeNull();
    expect(empty!.textContent?.trim()).toBe('No sessions recorded this month.');
  });

  it('does NOT show the empty-state message when there are attended sessions', () => {
    const fixture = buildFixture(d(2026, 4, 1), [d(2026, 4, 10)]);

    const empty = fixture.nativeElement.querySelector('[data-cy="heatmap-empty"]');
    expect(empty).toBeNull();
  });

  it('always renders exactly 42 cells (6 rows × 7 cols) for layout stability', () => {
    // January 2026 starts on a Thursday — spans 5+ weeks.
    const fixture = buildFixture(d(2026, 1, 1), []);

    const allCells = fixture.nativeElement.querySelectorAll('[data-cy^="heatmap-cell"]');
    expect(allCells.length).toBe(42);
  });

  it('adds an aria-label on filled cells using the dayLabel translation key', () => {
    // Apr 3 2026 should produce aria-label "Trained on 2026-04-03".
    const fixture = buildFixture(d(2026, 4, 1), [d(2026, 4, 3)]);

    const filled = fixture.nativeElement.querySelector(
      '[data-cy="heatmap-cell-filled"]',
    ) as HTMLElement | null;
    expect(filled).not.toBeNull();
    expect(filled!.getAttribute('aria-label')).toBe('Trained on 2026-04-03');
  });
});
