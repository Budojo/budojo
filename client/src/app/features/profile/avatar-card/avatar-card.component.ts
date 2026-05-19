import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { UserAvatarComponent } from '../../../shared/components/user-avatar/user-avatar.component';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Avatar card (#411 — extracted from ProfileComponent in #847).
 * Left: avatar disc; right: title + hint + upload/replace/remove buttons.
 * MIME + size guards before upload; confirm-popup on remove (Krug §
 * forgiveness for mistakes). Reads `avatar_url` from the cached
 * `AuthService.user` signal so the disc rerenders whenever a sibling
 * tab refreshes the user.
 */
@Component({
  selector: 'app-avatar-card',
  standalone: true,
  imports: [ButtonModule, ConfirmPopup, TranslatePipe, UserAvatarComponent],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar-card.component.html',
  styleUrl: './avatar-card.component.scss',
})
export class AvatarCardComponent {
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  @ViewChild('avatarInput') private avatarInput?: ElementRef<HTMLInputElement>;

  protected readonly user = this.authService.user;
  protected readonly avatarUploading = signal<boolean>(false);
  protected readonly avatarUrl = computed<string | null>(() => this.user()?.avatar_url ?? null);

  protected onAvatarBrowse(): void {
    this.avatarInput?.nativeElement.click();
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!ALLOWED_AVATAR_MIME.includes(file.type)) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('profile.avatarToast.unsupportedSummary'),
        detail: this.translate.instant('profile.avatarToast.unsupportedDetail'),
        life: 4000,
      });
      input.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('profile.avatarToast.tooLargeSummary'),
        detail: this.translate.instant('profile.avatarToast.tooLargeDetail'),
        life: 4000,
      });
      input.value = '';
      return;
    }

    this.avatarUploading.set(true);
    this.authService.uploadAvatar(file).subscribe({
      next: () => {
        this.avatarUploading.set(false);
        input.value = '';
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.avatarToast.uploadSuccess'),
          life: 2500,
        });
      },
      error: () => {
        this.avatarUploading.set(false);
        input.value = '';
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.avatarToast.uploadErrorSummary'),
          detail: this.translate.instant('profile.avatarToast.uploadErrorDetail'),
          life: 4000,
        });
      },
    });
  }

  protected confirmRemoveAvatar(event: Event): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: this.translate.instant('profile.avatarConfirm.removeMessage'),
      acceptLabel: this.translate.instant('profile.avatarConfirm.removeAccept'),
      rejectLabel: this.translate.instant('profile.avatarConfirm.removeReject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.removeAvatar(),
    });
  }

  private removeAvatar(): void {
    this.authService.removeAvatar().subscribe({
      next: () =>
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.avatarToast.removeSuccess'),
          life: 2500,
        }),
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.avatarToast.removeErrorSummary'),
          detail: this.translate.instant('profile.avatarToast.removeErrorDetail'),
          life: 4000,
        }),
    });
  }
}
