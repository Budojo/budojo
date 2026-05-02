import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ExpiringDocument } from '../../../core/services/document.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { ExpiringDocumentsWidgetComponent } from './expiring-documents-widget.component';

function makeExpiring(overrides: Partial<ExpiringDocument> = {}): ExpiringDocument {
  return {
    id: 1,
    athlete_id: 42,
    type: 'medical_certificate',
    original_name: 'med.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    issued_at: '2025-01-01',
    expires_at: '2026-05-10',
    notes: null,
    created_at: '2026-04-20T10:00:00+00:00',
    deleted_at: null,
    athlete: { id: 42, first_name: 'Mario', last_name: 'Rossi' },
    ...overrides,
  };
}

describe('ExpiringDocumentsWidgetComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExpiringDocumentsWidgetComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18nTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function mount(): ComponentFixture<ExpiringDocumentsWidgetComponent> {
    const fixture = TestBed.createComponent(ExpiringDocumentsWidgetComponent);
    fixture.detectChanges(); // triggers ngOnInit + initial fetch
    return fixture;
  }

  function flushExpiring(docs: ExpiringDocument[]): void {
    httpMock.expectOne((r) => r.url === '/api/v1/documents/expiring').flush({ data: docs });
  }

  it('fetches /api/v1/documents/expiring?days=30 on init', () => {
    mount();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/v1/documents/expiring' && r.params.get('days') === '30',
    );
    req.flush({ data: [] });
  });

  it('renders the loading skeleton while the request is in flight', () => {
    const fixture = mount();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="expiring-widget-loading"]')).not.toBeNull();

    // Clean up the pending request so afterEach verify() passes.
    httpMock.expectOne('/api/v1/documents/expiring?days=30').flush({ data: [] });
  });

  it('shows the "all up to date" muted state when the count is zero', () => {
    const fixture = mount();
    flushExpiring([]);
    fixture.detectChanges();

    const widget = fixture.nativeElement.querySelector(
      '[data-cy="expiring-widget"]',
    ) as HTMLElement | null;
    expect(widget).not.toBeNull();
    expect(widget!.textContent).toContain('All documents up to date');
    expect(widget!.classList.contains('widget--muted')).toBe(true);
  });

  it('shows the count and alert styling when expiring documents are returned', () => {
    const fixture = mount();
    flushExpiring([makeExpiring({ id: 1 }), makeExpiring({ id: 2 }), makeExpiring({ id: 3 })]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const widget = el.querySelector('[data-cy="expiring-widget"]') as HTMLElement | null;
    expect(widget?.classList.contains('widget--alert')).toBe(true);

    const countNode = el.querySelector('[data-cy="expiring-widget-count"]');
    expect(countNode?.textContent?.trim()).toBe('3 documents need attention');
  });

  it('uses the singular form when exactly one document is expiring', () => {
    const fixture = mount();
    flushExpiring([makeExpiring({ id: 1 })]);
    fixture.detectChanges();

    const countNode = fixture.nativeElement.querySelector('[data-cy="expiring-widget-count"]');
    expect(countNode?.textContent?.trim()).toBe('1 document needs attention');
  });

  it('routes the tile anchor to /dashboard/documents/expiring', () => {
    const fixture = mount();
    flushExpiring([]);
    fixture.detectChanges();

    const anchor = fixture.nativeElement.querySelector(
      '[data-cy="expiring-widget"]',
    ) as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe('/dashboard/documents/expiring');
  });

  it('falls back to a muted error state when the fetch fails (non-blocking)', () => {
    const fixture = mount();
    httpMock.expectOne('/api/v1/documents/expiring?days=30').error(new ProgressEvent('Network'), {
      status: 500,
      statusText: 'ISE',
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="expiring-widget-error"]')).not.toBeNull();
    // The anchor must not render — we don't want to deep-link into a list
    // fetched through the same failing path.
    expect(el.querySelector('[data-cy="expiring-widget"]')).toBeNull();
  });
});
