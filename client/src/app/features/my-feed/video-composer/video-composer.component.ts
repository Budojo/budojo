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
 */
function urlValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? null : { url: true };
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
 * — the dialog stays open with a specific hint so the user can fix the link
 * without re-typing.
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

  protected readonly form = this.fb.nonNullable.group({
    url: ['', [Validators.required, Validators.maxLength(2048), urlValidator]],
    caption: ['', [Validators.maxLength(500)]],
  });

  private resetForm(): void {
    this.form.reset({ url: '', caption: '' });
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
          // a specific hint; anything else is a generic failure.
          const unreadable = err instanceof HttpErrorResponse && err.status === 422;
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('community.video.composer.errorSummary'),
            detail: this.translate.instant(
              unreadable
                ? 'community.video.composer.errorUnreadable'
                : 'community.video.composer.errorGeneric',
            ),
            life: 5000,
          });
        },
      });
  }
}
