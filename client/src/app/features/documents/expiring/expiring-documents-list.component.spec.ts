import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AthleteMissingMedicalCertificate,
  ExpiringDocument,
} from '../../../core/services/document.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
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

  function mount(): ComponentFixture<ExpiringDocumentsListComponent> {
    const fixture = TestBed.createComponent(ExpiringDocumentsListComponent);
    fixture.detectChanges();
    return fixture;
  }

  function flushHealth(
    docs: ExpiringDocument[],
    missing: AthleteMissingMedicalCertificate[] = [],
  ): void {
    httpMock
      .expectOne('/api/v1/documents/expiring?days=30')
      .flush({ data: docs, missing_medical_certificate: missing });
  }

  it('fetches the documents-health envelope (days=30) on init', () => {
    mount();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/v1/documents/expiring' && r.params.get('days') === '30',
    );
    req.flush({ data: [], missing_medical_certificate: [] });
  });

  it('renders rows with athlete name + deep-link to the athlete documents page', () => {
    const fixture = mount();
    flushHealth([
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

  it('shows the empty-state block when no expiring documents AND no missing certs exist', () => {
    const fixture = mount();
    flushHealth([], []);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="all-clear-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="athlete-link"]')).toBeNull();
    expect(el.querySelector('[data-cy="missing-cert-section"]')).toBeNull();
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

  it('renders the missing-cert section when athletes without medical certs are returned', () => {
    const fixture = mount();
    flushHealth(
      [],
      [
        { id: 11, first_name: 'Giulia', last_name: 'Rossi' },
        { id: 12, first_name: 'Luca', last_name: 'Verdi' },
      ],
    );
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const section = el.querySelector('[data-cy="missing-cert-section"]');
    expect(section).not.toBeNull();
    const rows = el.querySelectorAll(
      '[data-cy^="missing-cert-row-"]',
    ) as NodeListOf<HTMLAnchorElement>;
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Giulia Rossi');
    expect(rows[0].getAttribute('href')).toBe('/dashboard/athletes/11/documents');
    expect(rows[1].textContent).toContain('Luca Verdi');
    expect(rows[1].getAttribute('href')).toBe('/dashboard/athletes/12/documents');
  });

  it('hides the missing-cert section when no missing certs are returned', () => {
    const fixture = mount();
    flushHealth([makeExpiring({ id: 9 })], []);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="missing-cert-section"]'),
    ).toBeNull();
  });

  it('hides the expiring section when only missing certs exist (no expired documents)', () => {
    const fixture = mount();
    flushHealth([], [{ id: 11, first_name: 'Giulia', last_name: 'Rossi' }]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    // Missing section is visible, but the expiring section block should be
    // entirely gone so the user isn't confused by an empty list under it.
    expect(el.querySelector('[data-cy="missing-cert-section"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="expiring-section"]')).toBeNull();
  });

  it('count phrasing uses singular when only one expiring document is returned', () => {
    const fixture = mount();
    flushHealth([makeExpiring({ id: 1 })], []);
    fixture.detectChanges();

    const countNode = fixture.nativeElement.querySelector('[data-cy=page-header-count]');
    expect(countNode?.textContent).toContain('1 expiring');
  });

  it('count phrasing combines expiring + missing when both are present', () => {
    const fixture = mount();
    flushHealth(
      [makeExpiring({ id: 1 }), makeExpiring({ id: 2 }), makeExpiring({ id: 3 })],
      [
        { id: 11, first_name: 'Giulia', last_name: 'Rossi' },
        { id: 12, first_name: 'Luca', last_name: 'Verdi' },
      ],
    );
    fixture.detectChanges();

    const countNode = fixture.nativeElement.querySelector('[data-cy=page-header-count]');
    expect(countNode?.textContent).toContain('3 expiring');
    expect(countNode?.textContent).toContain('2 no certificate');
  });
});
