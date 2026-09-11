import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttendanceHeatmapComponent } from './attendance-heatmap.component';
import { LanguageService } from '../../../core/services/language.service';
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

  it('colours a cell by how busy the day was, on one shared ramp (#1550)', () => {
    // It used to colour by MONTH — pink for September, orange for July — while
    // the legend beneath taught a blue scale the squares only used in January.
    // The hue said which month, which the axis above already says in words.
    const windowStart = new Date(2026, 4, 4); // Mon 4 May 2026, local
    const windowEnd = new Date(2026, 4, 10); // Sun 10 May 2026, local
    createComponent([{ date: '2026-05-04', count: 3 }], windowStart, windowEnd);

    const rects: NodeListOf<SVGRectElement> =
      fixture.nativeElement.querySelectorAll('rect.heatmap__cell');

    // Three sessions → bucket 2. Every other day in the window is empty →
    // bucket 0. Nothing carries an inline fill any more: the class is the
    // single source, shared with the legend.
    const classLists = Array.from(rects).map((r) => r.getAttribute('class') ?? '');
    expect(classLists.filter((c) => c.includes('heatmap__cell--b2')).length).toBe(1);
    expect(classLists.filter((c) => c.includes('heatmap__cell--b0')).length).toBe(6);
    expect(Array.from(rects).every((r) => r.getAttribute('style') === null)).toBe(true);
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

  // Locale regression-guards (#374). The component routes its tooltip date label
  // and month axis label through `localeFor(currentLang())` — `'en' → 'en-GB'`,
  // `'it' → 'it-IT'`. These specs pin the user-visible output for each locale so
  // a future regression (e.g. a stray hardcoded `'en-US'`) is caught here, not
  // by a beta tester. The choice of date is May 2026 — `Mon 4 May 2026` (en-GB,
  // day-first) vs. `lun 4 mag 2026` (it-IT) — picked because it differs in
  // weekday name, separator, day-month order, AND month abbreviation.

  it('renders tooltip + month label in en-GB for the default English locale', () => {
    createComponent(
      [{ date: '2026-05-04', count: 3 }],
      new Date(2026, 4, 4),
      new Date(2026, 4, 10),
    );

    const titles: Element[] = Array.from(
      fixture.nativeElement.querySelectorAll('rect.heatmap__cell title'),
    );
    const populatedCellTitle = titles.find((t) => (t.textContent ?? '').includes('3'));
    // en-GB: day-first ("4 May 2026"), short weekday "Mon", and an
    // (en-)`'attendances'` plural via the i18n key.
    expect(populatedCellTitle?.textContent).toContain('Mon');
    expect(populatedCellTitle?.textContent).toContain('4 May 2026');
    expect(populatedCellTitle?.textContent).toContain('attendances');

    const monthLabel = fixture.nativeElement.querySelector('.heatmap__month');
    expect(monthLabel?.textContent?.trim()).toBe('May');
  });

  it('renders tooltip + month label in it-IT after switching language to it', () => {
    const lang = TestBed.inject(LanguageService);
    lang.setLanguage('it');

    createComponent(
      [{ date: '2026-05-04', count: 3 }],
      new Date(2026, 4, 4),
      new Date(2026, 4, 10),
    );

    const titles: Element[] = Array.from(
      fixture.nativeElement.querySelectorAll('rect.heatmap__cell title'),
    );
    const populatedCellTitle = titles.find((t) => (t.textContent ?? '').includes('3'));
    // it-IT: day-first lower-case month, short weekday "lun", IT plural.
    expect(populatedCellTitle?.textContent).toContain('lun');
    expect(populatedCellTitle?.textContent).toContain('4 mag 2026');
    expect(populatedCellTitle?.textContent).toContain('presenze');

    const monthLabel = fixture.nativeElement.querySelector('.heatmap__month');
    expect(monthLabel?.textContent?.trim()).toBe('mag');
  });
});
