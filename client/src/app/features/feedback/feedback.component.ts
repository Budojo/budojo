import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { FeedbackService } from '../../core/services/feedback.service';

/**
 * In-app feedback form (#311). Three fields (subject + description +
 * optional image) submit to /api/v1/feedback; the server emails the
 * product owner with the user-supplied text plus the build version
 * and User-Agent. On success the form resets and stays on the page —
 * the user might want to file a follow-up. On error the form keeps
 * its contents so the user can retry without re-typing.
 *
 * Image upload is a plain `<input type="file">` rather than
 * PrimeNG's `<p-fileupload>`. The PrimeNG component is heavier than
 * the use case warrants (its own upload state machine, drag-and-drop,
 * progress bar) and adds friction integrating with Reactive Forms;
 * a native input + a thin preview is closer to the feedback page's
 * minimal vibe (DESIGN_SYSTEM § Apple-minimal).
 *
 * Validation matches the server: subject 3..100, description 10..2000,
 * image ≤ 5 MB and png/jpeg/webp. Client-side checks short-circuit
 * the network round-trip; the server still validates as the
 * authoritative gate.
 */
@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    ToastModule,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
})
export class FeedbackComponent {
  private readonly fb = inject(FormBuilder);
  private readonly feedbackService = inject(FeedbackService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  protected readonly ALLOWED_IMAGE_MIMES: ReadonlySet<string> = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);

  protected readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  protected readonly image = signal<File | null>(null);
  protected readonly imageError = signal<string | null>(null);
  protected readonly submitting = signal<boolean>(false);

  // ViewChild on the native file input so clearImage() / a successful
  // submit can reset `input.value = ''`. Without the reset the browser
  // keeps the previously-selected file in the control: re-picking the
  // SAME file does not fire a `change` event, and the native input
  // visually keeps showing the filename even after our preview is gone.
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /**
   * `<input type="file">` change handler. Validates client-side then
   * stores in the signal; rejected files surface an inline error
   * (toast would be over-noisy for a per-field validation).
   */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (file === null) {
      this.image.set(null);
      this.imageError.set(null);
      return;
    }

    if (!this.ALLOWED_IMAGE_MIMES.has(file.type)) {
      this.image.set(null);
      this.imageError.set(this.translate.instant('feedback.image.errorMime'));
      input.value = '';
      return;
    }

    if (file.size > this.MAX_IMAGE_BYTES) {
      this.image.set(null);
      this.imageError.set(this.translate.instant('feedback.image.errorSize'));
      input.value = '';
      return;
    }

    this.image.set(file);
    this.imageError.set(null);
  }

  protected clearImage(): void {
    this.image.set(null);
    this.imageError.set(null);
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.value = '';
    }
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const { subject, description } = this.form.getRawValue();
    this.submitting.set(true);

    this.feedbackService
      .submit({
        subject,
        description,
        image: this.image(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.form.reset();
          this.clearImage();
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('feedback.toast.successSummary'),
            detail: this.translate.instant('feedback.toast.successDetail'),
            life: 4000,
          });
        },
        error: () => {
          this.submitting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('feedback.toast.errorSummary'),
            detail: this.translate.instant('feedback.toast.errorDetail'),
            life: 5000,
          });
        },
      });
  }
}
