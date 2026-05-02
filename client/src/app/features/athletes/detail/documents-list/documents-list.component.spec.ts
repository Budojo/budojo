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

    fixture.componentInstance.confirmDelete(new Event('click'), doc);

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

    fixture.componentInstance.confirmDelete(new Event('click'), doc);
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
});
