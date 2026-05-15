import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MyAthleteService } from '../../../core/services/my-athlete.service';

/**
 * "Train at this academy" toggle on `/dashboard/profile` (#750,
 * frontend half of the owner-as-athlete epic #747). Owners and any
 * staff user with an active academy membership flip this to enroll
 * themselves as an athlete in their own academy. Once flipped on the
 * user appears in the roster with an `Owner` chip and a belt that
 * shows under their community posts.
 *
 * State machine:
 *
 *   loading — initial fetch of current state in progress
 *   errored — fetch failed; the user can click Retry
 *   ready   — toggle reflects current state, idle
 *   saving  — POST or DELETE in flight; toggle is disabled
 *
 * No confirm popup on toggle OFF — the action is fully reversible
 * (soft-delete preserves attendance + promotion history; flipping
 * back ON restores the same row id). A user who turns this off by
 * accident can recover with the same gesture. Adding a confirm
 * popup would mirror the regular delete-athlete flow, which is
 * irreversible — different shape of decision, doesn't apply here.
 */
@Component({
  selector: 'app-profile-train-here',
  standalone: true,
  imports: [ButtonModule, FormsModule, ProgressSpinnerModule, ToggleSwitchModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-train-here.component.html',
  styleUrl: './profile-train-here.component.scss',
})
export class ProfileTrainHereComponent implements OnInit {
  private readonly myAthleteService = inject(MyAthleteService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly saving = signal<boolean>(false);
  protected readonly enrolled = signal<boolean>(false);

  protected readonly disabled = computed(() => this.loading() || this.saving());

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.myAthleteService.state().subscribe({
      next: (state) => {
        this.enrolled.set(state.enrolled);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }

  protected onToggle(nextValue: boolean): void {
    if (nextValue === this.enrolled()) return;

    // Optimistic local flip — the toggle animation runs immediately.
    // Revert on error inside the per-action handler.
    this.enrolled.set(nextValue);
    this.saving.set(true);

    const observable = nextValue ? this.myAthleteService.enroll() : this.myAthleteService.leave();

    observable.subscribe({
      next: () => {
        this.saving.set(false);
        const toastKey = nextValue ? 'enrolled' : 'left';
        const severity = nextValue ? 'success' : 'info';
        this.messageService.add({
          severity,
          summary: this.translate.instant(`profile.trainHere.toast.${toastKey}.summary`),
          detail: this.translate.instant(`profile.trainHere.toast.${toastKey}.detail`),
          life: 4000,
        });
      },
      error: () => {
        // Roll back the optimistic flip and surface the error.
        this.enrolled.set(!nextValue);
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.trainHere.toast.error.summary'),
          detail: this.translate.instant('profile.trainHere.toast.error.detail'),
          life: 5000,
        });
      },
    });
  }
}
