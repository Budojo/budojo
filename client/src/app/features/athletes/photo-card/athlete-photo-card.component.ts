import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopup } from 'primeng/confirmpopup';

import { AthleteService, type Athlete } from '../../../core/services/athlete.service';
import { UserAvatarComponent } from '../../../shared/components/user-avatar/user-avatar.component';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_MIME = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * The athlete's photo (#1357).
 *
 * Deliberately the same component as `avatar-card` (#411) wearing a different
 * subject: same guards, same confirm-on-remove, same hidden file input behind a
 * visible button. Two upload cards that behaved differently would be two sets
 * of edge cases to get wrong, and the owner would have to learn both.
 *
 * The one structural difference is ownership of state. The avatar card reads
 * the cached `AuthService.user` signal, because there is exactly one signed-in
 * user. An athlete is one row of many, so this takes the athlete as an input
 * and emits the refreshed row — the parent owns it, and the list and the header
 * update from the same object rather than from a second fetch.
 *
 * **`ConfirmationService` is provided here, on the host.** It is not global;
 * a `p-confirmpopup` whose service comes from somewhere else silently never
 * opens — which is exactly how restore shipped broken in #1324.
 */
@Component({
  selector: 'app-athlete-photo-card',
  standalone: true,
  imports: [ButtonModule, ConfirmPopup, TranslatePipe, UserAvatarComponent],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './athlete-photo-card.component.html',
  styleUrl: './athlete-photo-card.component.scss',
})
export class AthletePhotoCardComponent {
  private readonly athleteService = inject(AthleteService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  readonly athlete = input.required<Athlete>();

  /** The refreshed row, so the parent updates without a second fetch. */
  readonly changed = output<Athlete>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');

  protected readonly uploading = signal(false);

  protected readonly photoUrl = computed<string | null>(() => this.athlete().photo_url ?? null);

  protected readonly fullName = computed<string>(() => {
    const a = this.athlete();

    return `${a.first_name} ${a.last_name}`.trim();
  });

  protected browse(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    // Checked here as well as on the server. The server is the authority — it
    // has to be, a client check is only a suggestion — but a 422 round-trip to
    // learn a PDF is not a photo is a worse answer than saying so immediately.
    if (!ALLOWED_PHOTO_MIME.includes(file.type)) {
      this.fail(
        input,
        'athletes.photo.toast.unsupportedSummary',
        'athletes.photo.toast.unsupportedDetail',
      );

      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      this.fail(
        input,
        'athletes.photo.toast.tooLargeSummary',
        'athletes.photo.toast.tooLargeDetail',
      );

      return;
    }

    this.uploading.set(true);
    this.athleteService.uploadPhoto(this.athlete().id, file).subscribe({
      next: (updated) => {
        this.uploading.set(false);
        input.value = '';
        this.changed.emit(updated);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('athletes.photo.toast.uploadSuccess'),
          life: 2500,
        });
      },
      error: () => {
        this.uploading.set(false);
        this.fail(
          input,
          'athletes.photo.toast.uploadErrorSummary',
          'athletes.photo.toast.uploadErrorDetail',
        );
      },
    });
  }

  protected confirmRemove(event: Event): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: this.translate.instant('athletes.photo.confirm.removeMessage'),
      acceptLabel: this.translate.instant('athletes.photo.confirm.removeAccept'),
      rejectLabel: this.translate.instant('athletes.photo.confirm.removeReject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.remove(),
    });
  }

  private remove(): void {
    this.athleteService.removePhoto(this.athlete().id).subscribe({
      next: (updated) => {
        this.changed.emit(updated);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('athletes.photo.toast.removeSuccess'),
          life: 2500,
        });
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.photo.toast.removeErrorSummary'),
          detail: this.translate.instant('athletes.photo.toast.removeErrorDetail'),
          life: 4000,
        }),
    });
  }

  /**
   * Clearing the input matters: without it, picking the same file again fires
   * no `change` event and the retry after a failure appears to do nothing.
   */
  private fail(input: HTMLInputElement, summaryKey: string, detailKey: string): void {
    input.value = '';
    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant(summaryKey),
      detail: this.translate.instant(detailKey),
      life: 4000,
    });
  }
}
