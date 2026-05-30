import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { type MonoTypeOperatorFunction, finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommunityPost, CommunityService } from '../../../core/services/community.service';

/**
 * Reject obvious non-URLs client-side so the submit button can't fire on
 * junk. The server owns the real provider allowlist (and 422s a
 * non-Instagram/YouTube/TikTok link) — this is just early UX.
 *
 * Every allowlisted provider is HTTPS-only, so an `http://` link is a
 * guaranteed server 422 — reject it at the field instead of round-tripping.
 */
function urlValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' ? null : { url: true };
  } catch {
    return { url: true };
  }
}

/**
 * "Share a video" composer dialog (#1155) — open to athletes AND owners
 * (unlike the owner-only event composer). Paste an Instagram / YouTube /
 * TikTok URL + an optional caption; the server resolves the preview and
 * returns the full `shared_video` post, which the parent prepends to the
 * feed (it renders via the facade tile from #1160).
 *
 * On a 422 the link wasn't an allowlisted provider or couldn't be resolved
 * — the dialog stays open and a persistent inline error sits under the form
 * (cleared the moment the user edits the URL), so they can fix the link
 * without re-typing. Success closes the dialog, so that path uses a toast.
 */
@Component({
  selector: 'app-video-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    TranslatePipe,
  ],
  templateUrl: './video-composer.component.html',
  styleUrl: './video-composer.component.scss',
})
export class VideoComposerComponent {
  private readonly communityService = inject(CommunityService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = input<boolean>(false);
  readonly visibleChange = output<boolean>();
  readonly created = output<CommunityPost>();

  protected readonly submitting = signal(false);
  /**
   * Persistent inline error shown under the form after a failed submit.
   * `'unreadable'` = server 422 (link not an allowlisted provider / couldn't
   * resolve); `'generic'` = anything else. Cleared as soon as the user edits
   * the URL — the field stops claiming it's wrong the moment they fix it.
   */
  protected readonly submitError = signal<'unreadable' | 'generic' | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    url: ['', [Validators.required, Validators.maxLength(2048), urlValidator]],
    caption: ['', [Validators.maxLength(500)]],
  });

  constructor() {
    this.form.controls.url.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.submitError.set(null));
  }

  private resetForm(): void {
    this.form.reset({ url: '', caption: '' });
    this.submitError.set(null);
  }

  /** p-dialog already emitted `visibleChange(false)` — just wipe the form. */
  protected onHide(): void {
    if (this.submitting()) {
      return;
    }
    this.resetForm();
  }

  protected onClose(): void {
    if (this.submitting()) {
      return;
    }
    this.visibleChange.emit(false);
    this.resetForm();
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    const raw = this.form.getRawValue();

    this.submitError.set(null);
    this.submitting.set(true);
    this.communityService
      .createSharedVideo({ url: raw.url, caption: raw.caption })
      .pipe(
        takeUntilDestroyed(this.destroyRef) as MonoTypeOperatorFunction<CommunityPost>,
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (post) => {
          this.created.emit(post);
          this.visibleChange.emit(false);
          this.resetForm();
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('community.video.composer.successSummary'),
            detail: this.translate.instant('community.video.composer.successDetail'),
            life: 4000,
          });
        },
        error: (err: unknown) => {
          // 422 = link isn't an allowlisted provider / couldn't resolve →
          // a specific hint; anything else is a generic failure. The dialog
          // stays open, so the error lives as a persistent inline message
          // (not a fading toast) until the user edits the URL.
          const unreadable = err instanceof HttpErrorResponse && err.status === 422;
          this.submitError.set(unreadable ? 'unreadable' : 'generic');
        },
      });
  }
}
