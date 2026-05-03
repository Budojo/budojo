import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttendanceHeatmapComponent } from './attendance-heatmap.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('AttendanceHeatmapComponent', () => {
  let fixture: ComponentFixture<AttendanceHeatmapComponent>;

  function createComponent(
    points: { date: string; count: number }[],
    windowStart: Date,
    windowEnd: Date,
  ): void {
    fixture = TestBed.createComponent(AttendanceHeatmapComponent);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('windowStart', windowStart);
    fixture.componentRef.setInput('windowEnd', windowEnd);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttendanceHeatmapComponent],
      providers: [...provideI18nTesting()],
    }).compileComponents();
  });

  it('renders the heatmap container', () => {
    createComponent([], new Date(2026, 1, 16), new Date(2026, 4, 15));
    expect(fixture.nativeElement.querySelector('[data-cy="attendance-heatmap"]')).toBeTruthy();
  });

  it('renders the correct number of week columns for a roughly 3-month window', () => {
    // 2026-02-16 (Mon) → 2026-05-15 = ~88 days ≈ 12–14 weeks.
    // Use local-time Date constructor to avoid UTC-parse timezone drift.
    createComponent([], new Date(2026, 1, 16), new Date(2026, 4, 15));
    const rects = fixture.nativeElement.querySelectorAll('.heatmap__cell');
    // 12–14 weeks × 7 days = 84–98 cells.
    expect(rects.length).toBeGreaterThanOrEqual(84);
    expect(rects.length).toBeLessThanOrEqual(98);
  });

  it('applies bucket-1+ classes only to cells with count > 0', () => {
    // Use local-time dates to avoid UTC-parse timezone drift.
    const windowStart = new Date(2026, 4, 4); // 2026-05-04 (Mon) local
    const windowEnd = new Date(2026, 4, 10); // 2026-05-10 (Sun) local
    const points = [{ date: '2026-05-04', count: 3 }]; // bucket-2
    createComponent(points, windowStart, windowEnd);
    // Scope to <rect> elements only — legend cells share the CSS class name.
    const populated = fixture.nativeElement.querySelectorAll('rect.heatmap__cell--bucket-2');
    expect(populated.length).toBe(1);
    // All other rect cells (count=0) should be bucket-0.
    const empty = fixture.nativeElement.querySelectorAll('rect.heatmap__cell--bucket-0');
    expect(empty.length).toBe(6);
  });

  it('gives cells outside the window the --out modifier class', () => {
    // windowStart is a Wednesday — Mon and Tue of the same week are out-of-window padding.
    // Use local-time Date constructor to avoid UTC-parse timezone drift.
    const windowStart = new Date(2026, 4, 6); // 2026-05-06 Wednesday local
    const windowEnd = new Date(2026, 4, 10); // 2026-05-10 Sunday local
    createComponent([], windowStart, windowEnd);
    const outCells = fixture.nativeElement.querySelectorAll('.heatmap__cell--out');
    // Monday May 4 and Tuesday May 5 are the two padding cells before Wednesday.
    expect(outCells.length).toBe(2);
  });

  it('renders all five legend cells', () => {
    createComponent([], new Date(2026, 1, 16), new Date(2026, 4, 15));
    const legendCells = fixture.nativeElement.querySelectorAll('.heatmap__legend-cell');
    expect(legendCells.length).toBe(5);
  });
});
