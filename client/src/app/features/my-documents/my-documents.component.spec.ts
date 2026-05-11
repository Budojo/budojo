import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyDocumentsComponent } from './my-documents.component';
import type { Document } from '../../core/services/document.service';
import { environment } from '../../../environments/environment';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function doc(over: Partial<Document> = {}): Document {
  return {
    id: 1,
    athlete_id: 1,
    type: 'id_card',
    original_name: 'id.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1234,
    issued_at: null,
    expires_at: null,
    notes: null,
    created_at: '2026-05-01T08:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [MyDocumentsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(MyDocumentsComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

describe('MyDocumentsComponent (M7 PR-D slice 5)', () => {
  it('shows the loading skeleton on first render', () => {
    const { el, http } = setup();
    expect(el.querySelector('[data-cy="my-documents-loading"]')).not.toBeNull();
    http.expectOne(`${environment.apiBase}/api/v1/me/documents`).flush({ data: [] });
  });

  it('renders the empty state when zero documents are returned', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/documents`).flush({ data: [] });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-documents-empty"]')).not.toBeNull();
  });

  it('renders the populated list with type + original name', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/documents`).flush({
      data: [
        doc({ id: 1, type: 'id_card', original_name: 'id.pdf' }),
        doc({ id: 2, type: 'medical_certificate', original_name: 'cert.pdf' }),
      ],
    });
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-cy^="document-"]').length).toBe(2);
    expect(el.querySelector('[data-cy="document-1"]')?.textContent).toContain('id.pdf');
    expect(el.querySelector('[data-cy="document-2"]')?.textContent).toContain('cert.pdf');
  });

  it('marks an expired document with the badge', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/documents`).flush({
      data: [doc({ id: 1, expires_at: '2020-01-01' })],
    });
    fixture.detectChanges();

    const row = el.querySelector('[data-cy="document-1"]');
    expect(row?.classList.contains('my-documents__row--expired')).toBe(true);
    expect(el.querySelector('[data-cy="document-expired-badge"]')).not.toBeNull();
  });

  describe('inclusive boundary (Copilot review on #625)', () => {
    beforeEach(() => {
      // Pin system time so "today" matches the fixture date below.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 15, 10, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('marks a document whose expires_at IS today as expired', () => {
      const { fixture, el, http } = setup();
      http.expectOne(`${environment.apiBase}/api/v1/me/documents`).flush({
        data: [doc({ id: 1, expires_at: '2026-05-15' })],
      });
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="document-expired-badge"]')).not.toBeNull();
    });

    it('does NOT mark a document whose expires_at is tomorrow', () => {
      const { fixture, el, http } = setup();
      http.expectOne(`${environment.apiBase}/api/v1/me/documents`).flush({
        data: [doc({ id: 1, expires_at: '2026-05-16' })],
      });
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="document-expired-badge"]')).toBeNull();
    });
  });

  it('renders the no-profile state on 404', () => {
    const { fixture, el, http } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/documents`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-documents-no-profile"]')).not.toBeNull();
  });

  it('renders the error state on 500', () => {
    const { fixture, el, http } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/documents`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-documents-error"]')).not.toBeNull();
  });
});
