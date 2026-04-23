import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { FileUpload, FileUploadModule } from 'primeng/fileupload';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  Document,
  DocumentService,
  DocumentType,
} from '../../../../core/services/document.service';

interface TypeOption {
  label: string;
  value: DocumentType;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors server Rule `max:10240` (kb)
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png';

/**
 * Convert a `Date` to a local-timezone `YYYY-MM-DD` string. Using `toISOString()`
 * would shift the date by up to ±1 day — we want the calendar date the user
 * actually picked. Mirrors the helper in `AthleteFormComponent`.
 */
function toDateString(d: Date | null | undefined): string | null {
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function maxFileSize(maxBytes: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const file = control.value as File | null;
    if (!file) return null;
    return file.size > maxBytes ? { maxSize: { max: maxBytes, actual: file.size } } : null;
  };
}

function mimeTypeIn(allowed: readonly string[]): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const file = control.value as File | null;
    if (!file) return null;
    return allowed.includes(file.type) ? null : { mimeType: { allowed, actual: file.type } };
  };
}

/**
 * Form-level validator. If BOTH dates are present and `expires_at` is before
 * `issued_at`, flag `expiryBeforeIssue` so the template can render a banner
 * without tying the error to either individual field (since the constraint is
 * relational). Mirrors the server `after_or_equal:issued_at` rule.
 */
const expiryAfterOrEqualIssue: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const issued = control.get('issued_at')?.value as Date | null;
  const expires = control.get('expires_at')?.value as Date | null;
  if (!issued || !expires) return null;
  return expires.getTime() < issued.getTime() ? { expiryBeforeIssue: true } : null;
};

@Component({
  selector: 'app-upload-document-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    FileUploadModule,
    MessageModule,
    SelectModule,
    TextareaModule,
  ],
  templateUrl: './upload-document-dialog.component.html',
  styleUrl: './upload-document-dialog.component.scss',
})
export class UploadDocumentDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly documentService = inject(DocumentService);

  /** Two-way bound. Parent owns the open/closed state — we just toggle it. */
  readonly visible = model.required<boolean>();
  readonly athleteId = input.required<number>();
  /** Emitted exactly once per successful upload with the server-created Document. */
  readonly uploaded = output<Document>();

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Cancel token for the in-flight upload subscription. Emitting here
   * (via `close()`) triggers `takeUntil` downstream, unsubscribing from the
   * HttpClient observable — Angular's XhrBackend aborts the underlying
   * request, so we also stop the server round-trip, not just the callback.
   * Prevents ghost `uploaded` emits from a request whose dialog was
   * already dismissed (mask click / Escape / close icon / route change).
   */
  private readonly cancelled$ = new Subject<void>();

  /** Exposed to the template for the p-fileUpload `accept` attribute and the size chip. */
  readonly acceptAttr = ACCEPT_ATTR;
  readonly maxFileBytes = MAX_FILE_BYTES;

  readonly typeOptions: TypeOption[] = [
    { label: 'ID card', value: 'id_card' },
    { label: 'Medical certificate', value: 'medical_certificate' },
    { label: 'Insurance', value: 'insurance' },
    { label: 'Other', value: 'other' },
  ];

  readonly form = this.fb.group(
    {
      type: this.fb.control<DocumentType | null>(null, Validators.required),
      file: this.fb.control<File | null>(null, [
        Validators.required,
        maxFileSize(MAX_FILE_BYTES),
        mimeTypeIn(ALLOWED_MIME_TYPES),
      ]),
      issued_at: this.fb.control<Date | null>(null),
      expires_at: this.fb.control<Date | null>(null),
      notes: this.fb.control<string>('', Validators.maxLength(500)),
    },
    { validators: [expiryAfterOrEqualIssue] },
  );

  get typeCtrl() {
    return this.form.controls.type;
  }
  get fileCtrl() {
    return this.form.controls.file;
  }
  get notesCtrl() {
    return this.form.controls.notes;
  }

  /**
   * p-fileUpload `basic` mode is not a ControlValueAccessor — we bridge its
   * `onSelect` / `onClear` events into the reactive FormControl so the rest
   * of the form validation pipeline (required, size, mime) stays uniform.
   */
  onFileSelect(files: File[]): void {
    this.fileCtrl.setValue(files[0] ?? null);
    this.fileCtrl.markAsTouched();
  }

  onFileClear(): void {
    this.fileCtrl.setValue(null);
    this.fileCtrl.markAsTouched();
  }

  submit(fileUpload?: FileUpload): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const body = new FormData();
    body.append('type', value.type!);
    body.append('file', value.file!);
    const issued = toDateString(value.issued_at);
    const expires = toDateString(value.expires_at);
    if (issued) body.append('issued_at', issued);
    if (expires) body.append('expires_at', expires);
    const trimmedNotes = value.notes?.trim();
    if (trimmedNotes) body.append('notes', trimmedNotes);

    this.submitting.set(true);
    this.error.set(null);

    this.documentService
      .upload(this.athleteId(), body)
      .pipe(
        takeUntil(this.cancelled$),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (doc) => {
          this.uploaded.emit(doc);
          this.close(fileUpload);
        },
        error: (err: {
          status?: number;
          error?: { message?: string; errors?: Record<string, string[]> };
        }) => {
          // Keep the dialog open with user input preserved (Norman forgiveness).
          // Prefer the first field error over the top-level message — it's the
          // one the user can most directly act on.
          const firstFieldError = err.error?.errors
            ? Object.values(err.error.errors)[0]?.[0]
            : null;
          this.error.set(
            firstFieldError ?? err.error?.message ?? 'Something went wrong. Please try again.',
          );
        },
      });
  }

  cancel(fileUpload?: FileUpload): void {
    this.close(fileUpload);
  }

  private close(fileUpload?: FileUpload): void {
    // Abort any in-flight upload first — idempotent, no-op if the
    // subscription already completed naturally (success path). Must come
    // before resetting state so a racing `next` callback can't sneak a
    // stale `uploaded.emit` or toast through after the dialog is closed.
    this.cancelled$.next();
    this.submitting.set(false);
    this.form.reset({ notes: '' });
    this.error.set(null);
    fileUpload?.clear();
    this.visible.set(false);
  }
}
