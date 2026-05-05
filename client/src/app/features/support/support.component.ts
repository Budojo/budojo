import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../core/services/auth.service';
import { SupportService, SupportTicketCategory } from '../../core/services/support.service';

/**
 * Single contact / support form (#423 + post-v1.17 consolidation that
 * retired the legacy /dashboard/feedback page). The legacy feedback
 * channel is folded in as a `feedback` category for messages that don't
 * expect a reply — same plumbing, single sidebar entry (Krug § "one
 * obvious destination per verb").
 *
 * The server persists a ticket row AND queues an email with Reply-To
 * set to the user, so the support inbox can hit Reply directly. The
 * "we'll reply to <email>" hint surfaces the authenticated user's email
 * read from `AuthService.user()` — the affordance that signals THIS
 * form expects an answer back.
 *
 * The form has four fields: subject (3..100 chars), category (one of
 * Account / Billing / Bug / Feedback / Other), body (10..5000 chars),
 * and an optional screenshot (PNG / JPEG / WEBP, max 5 MB). On success
 * the form resets and stays on the page so the user can file a follow-
 * up; on error the form keeps its contents so the user can retry
 * without re-typing.
 *
 * Image upload is a plain `<input type="file">` rather than PrimeNG's
 * `<p-fileupload>` — the PrimeNG component is heavier than the use
 * case warrants (own state machine, drag-and-drop, progress bar) and
 * adds friction integrating with Reactive Forms; a native input + a
 * thin preview matches the Apple-minimal vibe (DESIGN_SYSTEM § 1).
 *
 * Client-side validates MIME (png/jpeg/webp) + size ≤ 5 MB and short-
 * circuits the network round-trip; the server still validates as the
 * authoritative gate.
 */
@Component({
  selector: 'app-support',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    ToastModule,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support.component.html',
  styleUrl: './support.component.scss',
})
export class SupportComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supportService = inject(SupportService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly authService = inject(AuthService);

  protected readonly MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  protected readonly ALLOWED_IMAGE_MIMES: ReadonlySet<string> = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);

  /**
   * The five-case enum mirrored from the server's
   * `SupportTicketCategory`. Declared as a const-style array so the
   * order in the dropdown is stable across renders and the unit test
   * pinning the option order has something to assert against.
   *
   * PrimeNG's `p-select` types `[options]` as `any[]` (mutable). The
   * array literal is therefore declared without `readonly` modifiers so
   * Angular's strict template type-check accepts the binding without a
   * cast at every reference site.
   */
  protected readonly categoryOptions: { value: SupportTicketCategory; labelKey: string }[] = [
    { value: 'account', labelKey: 'support.category.options.account' },
    { value: 'billing', labelKey: 'support.category.options.billing' },
    { value: 'bug', labelKey: 'support.category.options.bug' },
    { value: 'feedback', labelKey: 'support.category.options.feedback' },
    { value: 'other', labelKey: 'support.category.options.other' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    category: this.fb.control<SupportTicketCategory | null>(null, {
      validators: [Validators.required],
    }),
    body: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
  });

  protected readonly image = signal<File | null>(null);
  protected readonly imageError = signal<string | null>(null);
  protected readonly submitting = signal<boolean>(false);

  // ViewChild on the native file input so clearImage() / a successful
  // submit can reset `input.value = ''`. Without the reset the browser
  // keeps the previously-selected file in the control: re-picking the
  // SAME file does not fire a `change` event.
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Authenticated user's email — surfaces in the "we'll reply to X" hint. */
  protected readonly userEmail = computed(() => this.authService.user()?.email ?? null);

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
      this.imageError.set(this.translate.instant('support.image.errorMime'));
      input.value = '';
      return;
    }

    if (file.size > this.MAX_IMAGE_BYTES) {
      this.image.set(null);
      this.imageError.set(this.translate.instant('support.image.errorSize'));
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

    const { subject, category, body } = this.form.getRawValue();
    if (category === null) {
      // Type-narrow: required validator already gates this, but the
      // typed payload contract demands a non-null category.
      return;
    }

    this.submitting.set(true);

    this.supportService.submit({ subject, category, body, image: this.image() }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.form.reset({ subject: '', category: null, body: '' });
        this.clearImage();
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('support.toast.successSummary'),
          detail: this.translate.instant('support.toast.successDetail'),
          life: 4000,
        });
      },
      error: () => {
        this.submitting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('support.toast.errorSummary'),
          detail: this.translate.instant('support.toast.errorDetail'),
          life: 5000,
        });
      },
    });
  }
}
