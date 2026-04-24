import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ExpiringDocument } from '../../../core/services/document.service';
import { ExpiringDocumentsListComponent } from './expiring-documents-list.component';

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

describe('ExpiringDocumentsListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExpiringDocumentsListComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function mount(): ComponentFixture<ExpiringDocumentsListComponent> {
    const fixture = TestBed.createComponent(ExpiringDocumentsListComponent);
    fixture.detectChanges();
    return fixture;
  }

  function flushExpiring(docs: ExpiringDocument[]): void {
    httpMock.expectOne('/api/v1/documents/expiring?days=30').flush({ data: docs });
  }

  it('fetches listExpiring(30) on init', () => {
    mount();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/v1/documents/expiring' && r.params.get('days') === '30',
    );
    req.flush({ data: [] });
  });

  it('renders rows with athlete name + deep-link to the athlete documents page', () => {
    const fixture = mount();
    flushExpiring([
      makeExpiring({
        id: 1,
        athlete_id: 42,
        athlete: { id: 42, first_name: 'Mario', last_name: 'Rossi' },
      }),
      makeExpiring({
        id: 2,
        athlete_id: 7,
        athlete: { id: 7, first_name: 'Anna', last_name: 'Bianchi' },
        type: 'insurance',
      }),
    ]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const links = el.querySelectorAll('[data-cy="athlete-link"]') as NodeListOf<HTMLAnchorElement>;
    expect(links).toHaveLength(2);
    expect(links[0].textContent?.trim()).toBe('Mario Rossi');
    expect(links[0].getAttribute('href')).toBe('/dashboard/athletes/42/documents');
    expect(links[1].textContent?.trim()).toBe('Anna Bianchi');
    expect(links[1].getAttribute('href')).toBe('/dashboard/athletes/7/documents');
  });

  it('shows the empty-state block when no expiring documents exist', () => {
    const fixture = mount();
    flushExpiring([]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="expiring-list-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="athlete-link"]')).toBeNull();
  });

  it('shows the error block when the fetch fails and hides the table', () => {
    const fixture = mount();
    httpMock
      .expectOne('/api/v1/documents/expiring?days=30')
      .error(new ProgressEvent('err'), { status: 500, statusText: 'ISE' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="expiring-list-error"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="expiring-table"]')).toBeNull();
  });

  it('count phrasing uses singular when only one document is returned', () => {
    const fixture = mount();
    flushExpiring([makeExpiring({ id: 1 })]);
    fixture.detectChanges();

    const countNode = fixture.nativeElement.querySelector('.expiring-page__count');
    // Wording covers both expired + expiring within 30 days, since the
    // endpoint includes already-past documents too.
    expect(countNode?.textContent).toContain('1 document expired or expiring within 30 days');
  });

  it('count phrasing uses plural when multiple are returned', () => {
    const fixture = mount();
    flushExpiring([makeExpiring({ id: 1 }), makeExpiring({ id: 2 }), makeExpiring({ id: 3 })]);
    fixture.detectChanges();

    const countNode = fixture.nativeElement.querySelector('.expiring-page__count');
    expect(countNode?.textContent).toContain('3 documents expired or expiring within 30 days');
  });
});
