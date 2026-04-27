import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { Toast } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AcademyService } from '../../../core/services/academy.service';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

/**
 * Academy home — a read-only grouped-list view of the current academy
 * plus the logo management surface.
 *
 * No own `fetch` call for the academy data: `hasAcademyGuard` already
 * hydrated `AcademyService.academy()` before routing here, so we read
 * the signal directly. The logo upload / remove flows mutate the same
 * signal, so the UI re-renders without a manual refresh.
 */
@Component({
  selector: 'app-academy-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonModule, ConfirmPopup, Toast],
  providers: [ConfirmationService, MessageService],
  templateUrl: './academy-detail.component.html',
  styleUrl: './academy-detail.component.scss',
})
export class AcademyDetailComponent {
  private readonly academyService = inject(AcademyService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  @ViewChild('logoInput') private logoInput?: ElementRef<HTMLInputElement>;

  protected readonly academy = this.academyService.academy;
  protected readonly logoUploading = signal(false);
  protected readonly logoUrl = computed(() => this.academy()?.logo_url ?? null);

  protected onLogoBrowse(): void {
    this.logoInput?.nativeElement.click();
  }

  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!ALLOWED_LOGO_MIME.includes(file.type)) {
      this.messageService.add({
        severity: 'error',
        summary: 'Unsupported file',
        detail: 'Use PNG, JPG, SVG or WebP.',
        life: 4000,
      });
      input.value = '';
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      this.messageService.add({
        severity: 'error',
        summary: 'File too large',
        detail: 'Maximum 2 MB.',
        life: 4000,
      });
      input.value = '';
      return;
    }

    this.logoUploading.set(true);
    this.academyService.uploadLogo(file).subscribe({
      next: () => {
        this.logoUploading.set(false);
        input.value = '';
        this.messageService.add({
          severity: 'success',
          summary: 'Logo updated',
          life: 2500,
        });
      },
      error: () => {
        this.logoUploading.set(false);
        input.value = '';
        this.messageService.add({
          severity: 'error',
          summary: 'Upload failed',
          detail: 'Could not save the new logo. Please try again.',
          life: 4000,
        });
      },
    });
  }

  protected confirmRemoveLogo(event: Event): void {
    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: 'Remove the academy logo?',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.removeLogo(),
    });
  }

  private removeLogo(): void {
    this.academyService.removeLogo().subscribe({
      next: () =>
        this.messageService.add({
          severity: 'success',
          summary: 'Logo removed',
          life: 2500,
        }),
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Remove failed',
          detail: 'Could not remove the logo. Please try again.',
          life: 4000,
        }),
    });
  }
}
