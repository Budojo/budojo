import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../core/services/auth.service';
import {
  SupportService,
  SupportTicketCategory,
} from '../../core/services/support.service';

/**
 * Dedicated support / contact form (#423). Distinct from the in-app
 * feedback page (#311):
 *
 * - Feedback is fire-and-forget, no Reply-To, no row persisted.
 * - Support is "I want a reply" — the server persists a ticket row
 *   AND queues an email with Reply-To set to the user.
 *
 * The form has three fields: subject (3..100 chars), category (one of
 * Account / Billing / Bug / Other), and body (10..5000 chars). On
 * success the form resets and stays on the page so the user can file
 * a follow-up; on error the form keeps its contents so the user can
 * retry without re-typing.
 *
 * The "we'll reply to <email>" hint surfaces the authenticated user's
 * email read from `AuthService.user()` — this is the affordance that
 * differentiates support from feedback (Norman § Signifier: a visible
 * cue that THIS form expects an answer back, at this address).
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

  /**
   * The four-case enum mirrored from the server's
   * `SupportTicketCategory`. Declared as a `const`-style array so the
   * order in the dropdown is stable across renders and the unit test
   * pinning the option order has something to assert against.
   */
  protected readonly categoryOptions: ReadonlyArray<{
    readonly value: SupportTicketCategory;
    readonly labelKey: string;
  }> = [
    { value: 'account', labelKey: 'support.category.options.account' },
    { value: 'billing', labelKey: 'support.category.options.billing' },
    { value: 'bug', labelKey: 'support.category.options.bug' },
    { value: 'other', labelKey: 'support.category.options.other' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    category: this.fb.control<SupportTicketCategory | null>(null, {
      validators: [Validators.required],
    }),
    body: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
  });

  protected readonly submitting = signal<boolean>(false);

  /** Authenticated user's email — surfaces in the "we'll reply to X" hint. */
  protected readonly userEmail = computed(() => this.authService.user()?.email ?? null);

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

    this.supportService
      .submit({ subject, category, body })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.form.reset({ subject: '', category: null, body: '' });
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
