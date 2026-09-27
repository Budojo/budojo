import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsPaymentsComponent } from './stats-payments.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { LanguageService } from '../../../core/services/language.service';
import { MessageService } from 'primeng/api';
import { type Academy, AcademyService } from '../../../core/services/academy.service';

interface ChartOptions {
  readonly maintainAspectRatio?: boolean;
  readonly plugins: {
    readonly tooltip: { readonly callbacks: { label(c: { parsed: { y: number } }): string } };
  };
  readonly scales: { readonly y: { readonly ticks: { callback(v: number): string } } };
}

describe('StatsPaymentsComponent', () => {
  let fixture: ComponentFixture<StatsPaymentsComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsPaymentsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
        MessageService,
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsPaymentsComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The arrears list reads on its own (#1760); its spec is where it is tested.
    http.match('/api/v1/stats/payments/arrears').forEach((req) => req.flush({ data: [] }));
    http.verify();
  });

  /** The chart options are a computed now, because the formatter follows the language. */
  const componentOptions = (): ChartOptions =>
    (fixture.componentInstance as unknown as { chartOptions(): ChartOptions }).chartOptions();

  it('lets the chart fill its box instead of spilling onto the arrears below', () => {
    // Chart.js keeps a 2:1 canvas unless told not to, so the bars ran ~150px
    // past the 20rem wrap. Harmless while nothing sat below the chart; since
    // the arrears list (#1760) did, the bars were drawn over it.
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [{ month: '2026-09', currency: 'EUR', amount_cents: 1761, future: false }],
    });
    fixture.detectChanges();

    expect(componentOptions().maintainAspectRatio).toBe(false);
    // …and the chart has a height to fill: without one the p-chart host is
    // auto-height, and Chart.js falls back to a 150px canvas. 100% of the
    // wrap, so the SCSS box stays the one place the size is set.
    const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-cy="stats-payments-chart"] p-chart',
    );
    expect(box?.style.height).toBe('100%');
  });

  it("puts the month's tiles before the chart's own header, not under it (#1759)", () => {
    // Between the header and the chart, "Monthly revenue · last 12 months"
    // read as the title of the four this-month figures.
    fixture.detectChanges();
    const section = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="stats-payments"]',
    );
    const order = Array.from(section?.children ?? []).map((el) => el.tagName.toLowerCase());

    expect(order.indexOf('app-payments-summary')).toBeLessThan(order.indexOf('header'));
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({ data: [] });
  });

  it('shows the loading skeleton while fetching', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-loading"]')).toBeTruthy();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({ data: [] });
  });

  it('shows the empty state when no buckets are returned', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({ data: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-empty"]')).toBeTruthy();
  });

  it('renders the chart when data is populated', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [
        { month: '2026-04', currency: 'EUR', amount_cents: 30000, future: false },
        { month: '2026-05', currency: 'EUR', amount_cents: 50000, future: false },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-chart"]')).toBeTruthy();
  });

  it('writes the bars as money, which the chart never used to say (#1549)', () => {
    // Hovering a bar gave `17.61`, and the chart never said seventeen of what.
    // The currency was computed from the first release and never rendered.
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [{ month: '2026-09', currency: 'EUR', amount_cents: 1761, future: false }],
    });
    fixture.detectChanges();

    const options = componentOptions();
    expect(options.plugins.tooltip.callbacks.label({ parsed: { y: 17.61 } })).toBe('€17.61');
    // The axis speaks the same language as the tooltip — a bare `18` beside a
    // `€17.61` would be the same defect one line down.
    expect(options.scales.y.ticks.callback(2560)).toBe('€2,560.00');
  });

  it('follows the language for the symbol side and the separators', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [{ month: '2026-09', currency: 'EUR', amount_cents: 256000, future: false }],
    });
    fixture.detectChanges();

    TestBed.inject(LanguageService).setLanguage('it');
    fixture.detectChanges();

    // Italian puts the symbol LAST and uses a comma for the decimals — the
    // reason this goes through `Intl` rather than a hand-rolled `€` prefix.
    //
    // Asserted as properties rather than one exact string: the thousands
    // separator is the ICU build's call (this one omits it for `it-IT`), and
    // pinning it would make the test a statement about Node rather than about
    // the component.
    const italian = componentOptions().plugins.tooltip.callbacks.label({ parsed: { y: 2560 } });
    expect(italian.endsWith('€')).toBe(true);
    expect(italian).toContain(',00');
    expect(italian.startsWith('€')).toBe(false);
  });

  it('draws the months already paid for, past today, as lighter bars (#1553)', () => {
    // The window reaches forward to the last month a fee covers, so a
    // quarterly bought this month puts two bars to the right of today. They
    // are the same series — money the academy already has — but they are not
    // earned yet, and a bar for November drawn in September at full strength
    // would read as revenue that has happened.
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({
      data: [
        { month: '2026-09', currency: 'EUR', amount_cents: 8000, future: false },
        { month: '2026-10', currency: 'EUR', amount_cents: 8000, future: true },
        { month: '2026-11', currency: 'EUR', amount_cents: 8000, future: true },
      ],
    });
    fixture.detectChanges();

    const data = (
      fixture.componentInstance as unknown as {
        chartData(): { datasets: { backgroundColor: string[] }[] };
      }
    ).chartData();

    expect(data.datasets[0].backgroundColor).toEqual(['#5b6cff', '#5b6cff55', '#5b6cff55']);
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/payments/monthly?months=12').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-payments-error"]')).toBeTruthy();
  });
  describe("the accountant's file (#1762)", () => {
    const EXPORT = '/api/v1/stats/payments/export';
    let appended: HTMLAnchorElement[];

    /** The season the academy is in, as the server reports it for today. */
    function inSeason(start: string, label: string): void {
      TestBed.inject(AcademyService).academy.set({
        season_start: start,
        season_label: label,
      } as Academy);
    }

    function renderPage(): void {
      fixture.detectChanges();
      http.expectOne('/api/v1/stats/payments/monthly?months=12').flush({ data: [] });
      fixture.detectChanges();
    }

    const exportHost = (): HTMLElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="stats-payments-export"]');

    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
      // jsdom has neither object URLs, which the download helper needs, nor
      // `matchMedia`, which the split button's menu reads on init.
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn((q: string) => ({
        matches: false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      })) as unknown as typeof window.matchMedia;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      // Keep the download anchor out of the page; everything else (the
      // menu's overlay) is appended as usual.
      appended = [];
      const append = document.body.appendChild.bind(document.body);
      vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
        if (node instanceof HTMLAnchorElement && node.download) {
          appended.push(node);
          return node;
        }
        return append(node);
      });
      const remove = document.body.removeChild.bind(document.body);
      vi.spyOn(document.body, 'removeChild').mockImplementation(<T extends Node>(node: T): T =>
        node instanceof HTMLAnchorElement && node.download ? node : remove(node),
      );
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      vi.restoreAllMocks();
    });

    /** The seasons the button's menu offers, as the component builds them. */
    const seasonItems = (): { label: string; command(): void }[] =>
      (
        fixture.componentInstance as unknown as {
          seasonItems(): { label: string; command(): void }[];
        }
      ).seasonItems();

    it('is one primary button that opens the seasons, not a split button', () => {
      inSeason('2026-09-01', '2026/27');
      renderPage();

      // A real button that says it opens a menu. Primary, because it is the
      // page's only action: a secondary fill on the page ground is ~1.04:1.
      const button = exportHost() as HTMLButtonElement;
      expect(button.tagName.toLowerCase()).toBe('button');
      expect(button.textContent).toContain('Export for the accountant');
      expect(button.classList).toContain('p-button');
      expect(button.className).not.toMatch(/p-button-(secondary|outlined|text)/);
      expect(button.getAttribute('aria-haspopup')).toBe('menu');
      expect((fixture.nativeElement as HTMLElement).querySelector('p-splitbutton')).toBeNull();

      // Pressing it opens the menu; it does not download anything on its own.
      const menu = (
        fixture.componentInstance as unknown as { seasonMenu(): { toggle(e: Event): void } }
      ).seasonMenu();
      const toggle = vi.spyOn(menu, 'toggle');
      button.click();
      expect(toggle).toHaveBeenCalledTimes(1);
      http.expectNone((r) => r.url === EXPORT);
    });

    it('downloads the current season as a file named after it', () => {
      inSeason('2026-09-01', '2026/27');
      renderPage();

      seasonItems()[0].command();

      // A blob, through HttpClient: a bare link would carry no Bearer token.
      const req = http.expectOne((r) => r.url === EXPORT && r.params.get('season') === '2026');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['csv'], { type: 'text/csv' }));

      expect(appended.map((a) => a.download)).toEqual(['budojo-payments-2026-27.csv']);
    });

    it('offers the season before too — in September the one the accountant wants', () => {
      inSeason('2026-09-01', '2026/27');
      renderPage();

      const items = seasonItems();
      expect(items.map((i) => i.label)).toEqual(['Season 2026/27', 'Season 2025/26']);

      items[1].command();
      http
        .expectOne((r) => r.url === EXPORT && r.params.get('season') === '2025')
        .flush(new Blob(['csv']));

      expect(appended.map((a) => a.download)).toEqual(['budojo-payments-2025-26.csv']);
    });

    it('names a calendar-year season by its year alone', () => {
      inSeason('2026-01-01', '2026');
      renderPage();

      expect(seasonItems().map((i) => i.label)).toEqual(['Season 2026', 'Season 2025']);
    });

    it('says so when the file could not be made', () => {
      inSeason('2026-09-01', '2026/27');
      renderPage();
      const toast = vi.spyOn(TestBed.inject(MessageService), 'add');

      seasonItems()[0].command();
      http
        .expectOne((r) => r.url === EXPORT)
        .flush(new Blob(['boom']), { status: 500, statusText: 'Server Error' });

      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
      expect(appended).toEqual([]);
    });

    it('offers nothing before the academy has said which season it is in', () => {
      renderPage();

      expect(exportHost()).toBeNull();
    });
  });
});
