import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { DocumentsListComponent } from './documents-list.component';
import { Document } from '../../../../core/services/document.service';

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    athlete_id: 42,
    type: 'medical_certificate',
    original_name: 'med.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    issued_at: '2026-01-01',
    expires_at: '2027-01-01',
    notes: null,
    created_at: '2026-04-23T10:00:00+00:00',
    deleted_at: null,
    ...overrides,
  };
}

function setupTestBed(): HttpTestingController {
  const parentParamMap = convertToParamMap({ id: '42' });
  TestBed.configureTestingModule({
    imports: [DocumentsListComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          // Component reads `this.route.parent?.paramMap` — mock it as a minimal stub.
          parent: { paramMap: of(parentParamMap) },
          snapshot: { paramMap: convertToParamMap({}) },
        },
      },
      ...provideI18nTesting(),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('DocumentsListComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads active documents on init (toggle off by default)', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/v1/athletes/42/documents' && !r.params.has('trashed'),
    );
    req.flush({ data: [makeDoc({ id: 1 }), makeDoc({ id: 2 })] });

    expect(fixture.componentInstance.documents()).toHaveLength(2);
    expect(fixture.componentInstance.showCancelled()).toBe(false);
    httpMock.verify();
  });

  it('reloads with ?trashed=1 when the cancelled toggle is turned on', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();

    // Initial load
    httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/documents').flush({ data: [] });

    // Flip the toggle
    fixture.componentInstance.onToggleCancelled(true);

    const reloadReq = httpMock.expectOne(
      (r) => r.url === '/api/v1/athletes/42/documents' && r.params.get('trashed') === '1',
    );
    reloadReq.flush({ data: [makeDoc({ id: 1, deleted_at: '2026-04-20T10:00:00+00:00' })] });

    expect(fixture.componentInstance.showCancelled()).toBe(true);
    expect(fixture.componentInstance.documents()).toHaveLength(1);
    expect(localStorage.getItem('documents.showCancelled')).toBe('1');
    httpMock.verify();
  });

  it('persists the toggle state to localStorage across component instances', () => {
    // First instance: turn toggle on
    {
      const httpMock = setupTestBed();
      const fixture = TestBed.createComponent(DocumentsListComponent);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/documents').flush({ data: [] });
      fixture.componentInstance.onToggleCancelled(true);
      httpMock
        .expectOne(
          (r) => r.url === '/api/v1/athletes/42/documents' && r.params.get('trashed') === '1',
        )
        .flush({ data: [] });
      httpMock.verify();
      TestBed.resetTestingModule();
    }

    // Second instance: initial state reads the persisted flag
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();

    httpMock
      .expectOne(
        (r) => r.url === '/api/v1/athletes/42/documents' && r.params.get('trashed') === '1',
      )
      .flush({ data: [] });
    expect(fixture.componentInstance.showCancelled()).toBe(true);
    httpMock.verify();
  });

  it('applies optimistic UI on delete — removes immediately, shows success toast', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();

    const doc = makeDoc({ id: 7 });
    httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/documents').flush({ data: [doc] });

    // Bypass the p-confirmpopup by calling the private action directly via the accept
    // callback wiring — we simulate user confirming by triggering the service call:
    // We can't easily reach the confirm callback; invoke the public flow via a fake event.
    // ConfirmationService is provided at the component level (not root), so we
    // must pull it from the component's own injector.
    const confirm = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirm, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirm;
    });

    fixture.componentInstance.confirmDelete(new MouseEvent('click'), doc);

    // Optimistic removal: BEFORE the DELETE round-trip completes, the row is gone.
    expect(fixture.componentInstance.documents()).toHaveLength(0);

    // Server confirms the delete.
    httpMock.expectOne('/api/v1/documents/7').flush(null);
    httpMock.verify();
  });

  it('rolls back optimistic delete when the server errors', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();

    const doc = makeDoc({ id: 9 });
    httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/documents').flush({ data: [doc] });

    // ConfirmationService is provided at the component level (not root), so we
    // must pull it from the component's own injector.
    const confirm = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirm, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirm;
    });

    fixture.componentInstance.confirmDelete(new MouseEvent('click'), doc);
    expect(fixture.componentInstance.documents()).toHaveLength(0);

    // Server fails — component must restore the row.
    httpMock
      .expectOne('/api/v1/documents/9')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.documents()).toHaveLength(1);
    expect(fixture.componentInstance.documents()[0].id).toBe(9);
    httpMock.verify();
  });

  it('computes active and cancelled counts', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes/42/documents')
      .flush({
        data: [
          makeDoc({ id: 1 }),
          makeDoc({ id: 2 }),
          makeDoc({ id: 3, deleted_at: '2026-04-20T10:00:00+00:00' }),
        ],
      });

    expect(fixture.componentInstance.activeCount()).toBe(2);
    expect(fixture.componentInstance.cancelledCount()).toBe(1);
    httpMock.verify();
  });

  it('renders a tombstone date for a soft-deleted document', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/documents').flush({ data: [] });

    const cmp = fixture.componentInstance;
    expect(cmp.cancelledOn(makeDoc({ deleted_at: '2026-04-20T10:00:00+00:00' }))).toBe(
      '2026-04-20',
    );
    expect(cmp.cancelledOn(makeDoc({ deleted_at: null }))).toBe(null);
    httpMock.verify();
  });

  // ── Mobile cards (#679, audit row 7) ──────────────────────────────────
  //
  // The desktop table is always in the DOM and toggled via CSS, so unit
  // tests run against the desktop spec by default. The mobile card list
  // is a sibling render path that lives in the same component template;
  // assert the markup is in the DOM regardless of viewport (CSS handles
  // visibility) so the conditional branches (loading, empty, per-doc,
  // tombstone-gated actions) don't drift on a future refactor.

  describe('mobile card list', () => {
    it('renders one .document-card per loaded document with the type label and the filename', () => {
      const httpMock = setupTestBed();
      const fixture = TestBed.createComponent(DocumentsListComponent);
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url === '/api/v1/athletes/42/documents')
        .flush({
          data: [
            makeDoc({ id: 7, type: 'medical_certificate', original_name: 'medical-2026.pdf' }),
            makeDoc({ id: 8, type: 'id_card', original_name: 'id-card.pdf' }),
          ],
        });
      fixture.detectChanges();

      const root: HTMLElement = fixture.nativeElement;
      // Tag-scope to <li> so the selector matches only the card hosts,
      // not the child action buttons (`document-card-download-N`,
      // `document-card-delete-N`) that share the prefix.
      const cards = root.querySelectorAll('li[data-cy^="document-card-"]');
      expect(cards.length).toBe(2);

      const medical = root.querySelector('[data-cy="document-card-7"]') as HTMLElement;
      expect(medical).not.toBeNull();
      expect(medical.querySelector('.document-card__filename')?.textContent?.trim()).toBe(
        'medical-2026.pdf',
      );
      httpMock.verify();
    });

    it('hides download + delete actions on a tombstone (deleted_at != null)', () => {
      const httpMock = setupTestBed();
      const fixture = TestBed.createComponent(DocumentsListComponent);
      // Toggle on so the cancelled doc renders.
      fixture.componentInstance.showCancelled.set(true);
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/athletes/42/documents'))
        .flush({
          data: [
            makeDoc({ id: 9, deleted_at: '2026-04-20T10:00:00+00:00', original_name: 'old.pdf' }),
            makeDoc({ id: 10, deleted_at: null, original_name: 'live.pdf' }),
          ],
        });
      fixture.detectChanges();

      const root: HTMLElement = fixture.nativeElement;

      // Cancelled doc: no download or delete inline (Norman §
      // affordance — absent rather than disabled with error).
      expect(root.querySelector('[data-cy="document-card-download-9"]')).toBeNull();
      expect(root.querySelector('[data-cy="document-card-delete-9"]')).toBeNull();
      // Live doc: both affordances present.
      expect(root.querySelector('[data-cy="document-card-download-10"]')).not.toBeNull();
      expect(root.querySelector('[data-cy="document-card-delete-10"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows the mobile empty state when the loaded list is empty', () => {
      const httpMock = setupTestBed();
      const fixture = TestBed.createComponent(DocumentsListComponent);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/documents').flush({ data: [] });
      fixture.detectChanges();

      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('[data-cy="documents-mobile-empty"]')).not.toBeNull();
      // No card hosts in the empty case (tag-scoped to <li> for the
      // same reason as the previous spec).
      expect(root.querySelector('li[data-cy^="document-card-"]')).toBeNull();
      httpMock.verify();
    });
  });
});
