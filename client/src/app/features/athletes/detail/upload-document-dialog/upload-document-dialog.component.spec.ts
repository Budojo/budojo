import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Document } from '../../../../core/services/document.service';
import { UploadDocumentDialogComponent } from './upload-document-dialog.component';

// Host component so we can exercise the `[(visible)]` model binding and the
// `(uploaded)` output the way a real parent would. Keeps the dialog spec
// framed around its public contract, not its internals.
@Component({
  imports: [UploadDocumentDialogComponent],
  template: `
    <app-upload-document-dialog
      [(visible)]="visible"
      [athleteId]="athleteId"
      (uploaded)="emitted.set($event)"
    />
  `,
})
class HostComponent {
  visible = true;
  athleteId = 42;
  readonly emitted = signal<Document | null>(null);
}

function tinyPdfFile(name = 'x.pdf', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

function hugeFile(name = 'huge.pdf', bytes = 11 * 1024 * 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

describe('UploadDocumentDialogComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UploadDocumentDialogComponent, HostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function mount() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const dialog = fixture.debugElement.query((el) => el.name === 'app-upload-document-dialog')
      .componentInstance as UploadDocumentDialogComponent;
    return { fixture, dialog };
  }

  describe('validation', () => {
    it('starts invalid — type and file are required', () => {
      const { dialog } = mount();
      expect(dialog.form.invalid).toBe(true);
      expect(dialog.form.controls.type.hasError('required')).toBe(true);
      expect(dialog.form.controls.file.hasError('required')).toBe(true);
    });

    it('rejects a file larger than 10 MB with a size error', () => {
      const { dialog } = mount();
      dialog.form.controls.file.setValue(hugeFile());
      expect(dialog.form.controls.file.hasError('maxSize')).toBe(true);
    });

    it('rejects a file with a disallowed mime type', () => {
      const { dialog } = mount();
      const exe = new File([new Uint8Array(100)], 'virus.exe', {
        type: 'application/x-msdownload',
      });
      dialog.form.controls.file.setValue(exe);
      expect(dialog.form.controls.file.hasError('mimeType')).toBe(true);
    });

    it('accepts pdf / jpeg / png', () => {
      const { dialog } = mount();
      for (const mime of ['application/pdf', 'image/jpeg', 'image/png']) {
        const f = new File([new Uint8Array(10)], `f.${mime.split('/')[1]}`, { type: mime });
        dialog.form.controls.file.setValue(f);
        expect(dialog.form.controls.file.hasError('mimeType')).toBe(false);
      }
    });

    it('flags expires_at before issued_at as a cross-field error', () => {
      const { dialog } = mount();
      dialog.form.patchValue({
        issued_at: new Date(2026, 5, 1),
        expires_at: new Date(2026, 0, 1),
      });
      expect(dialog.form.hasError('expiryBeforeIssue')).toBe(true);
    });

    it('allows expires_at equal to issued_at (matches server after_or_equal rule)', () => {
      const { dialog } = mount();
      const sameDay = new Date(2026, 5, 1);
      dialog.form.patchValue({ issued_at: sameDay, expires_at: sameDay });
      expect(dialog.form.hasError('expiryBeforeIssue')).toBe(false);
    });
  });

  describe('submit', () => {
    it('POSTs multipart with all filled fields and closes the dialog on 201', () => {
      const { fixture, dialog } = mount();
      const host = fixture.componentInstance;
      const file = tinyPdfFile('med_2026.pdf');

      dialog.form.patchValue({
        type: 'medical_certificate',
        file,
        issued_at: new Date(2026, 0, 15),
        expires_at: new Date(2027, 0, 15),
        notes: 'Dr. Rossi clinic',
      });
      dialog.submit();

      const req = httpMock.expectOne('/api/v1/athletes/42/documents');
      expect(req.request.method).toBe('POST');
      const body = req.request.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('type')).toBe('medical_certificate');
      expect(body.get('file')).toBe(file);
      expect(body.get('issued_at')).toBe('2026-01-15');
      expect(body.get('expires_at')).toBe('2027-01-15');
      expect(body.get('notes')).toBe('Dr. Rossi clinic');

      const doc: Document = {
        id: 101,
        athlete_id: 42,
        type: 'medical_certificate',
        original_name: 'med_2026.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        issued_at: '2026-01-15',
        expires_at: '2027-01-15',
        notes: 'Dr. Rossi clinic',
        created_at: '2026-04-24T10:00:00+00:00',
        deleted_at: null,
      };
      req.flush({ data: doc });

      expect(host.emitted()?.id).toBe(101);
      expect(host.visible).toBe(false);
      expect(dialog.form.pristine).toBe(true); // reset after success
    });

    it('omits optional fields when blank / whitespace', () => {
      const { dialog } = mount();
      dialog.form.patchValue({
        type: 'other',
        file: tinyPdfFile('x.pdf'),
        notes: '   ',
      });
      dialog.submit();

      const body = httpMock.expectOne('/api/v1/athletes/42/documents').request.body as FormData;
      expect(body.has('type')).toBe(true);
      expect(body.has('file')).toBe(true);
      expect(body.has('issued_at')).toBe(false);
      expect(body.has('expires_at')).toBe(false);
      expect(body.has('notes')).toBe(false);
    });

    it('surfaces 422 into the error banner and keeps the dialog open + values preserved', () => {
      const { fixture, dialog } = mount();
      const host = fixture.componentInstance;

      dialog.form.patchValue({ type: 'medical_certificate', file: tinyPdfFile() });
      dialog.submit();

      httpMock.expectOne('/api/v1/athletes/42/documents').flush(
        {
          message: 'The file must not exceed 10 MB.',
          errors: { file: ['The file must not exceed 10 MB.'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(dialog.error()).toContain('10 MB');
      expect(host.visible).toBe(true);
      expect(dialog.form.controls.type.value).toBe('medical_certificate');
      expect(dialog.submitting()).toBe(false);
    });

    it('does not submit when the form is invalid', () => {
      const { dialog } = mount();
      // Missing file and type.
      dialog.submit();
      httpMock.expectNone('/api/v1/athletes/42/documents');
    });
  });

  describe('cancel', () => {
    it('closes the dialog, resets the form, and does not POST', () => {
      const { fixture, dialog } = mount();
      const host = fixture.componentInstance;
      dialog.form.patchValue({
        type: 'insurance',
        file: tinyPdfFile(),
        notes: 'draft text',
      });

      dialog.cancel();

      expect(host.visible).toBe(false);
      expect(dialog.form.controls.notes.value).toBeFalsy();
      expect(dialog.form.controls.type.value).toBeFalsy();
      expect(dialog.form.controls.file.value).toBeNull();
      httpMock.expectNone('/api/v1/athletes/42/documents');
    });
  });
});
