import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { TooltipModule } from 'primeng/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ONBOARDING_STEPS,
  OnboardingService,
  OnboardingStep,
} from '../../core/services/onboarding.service';
import { CONFIRM_REJECT_BUTTON } from '../../shared/utils/confirm-buttons';

/**
 * Static map of step → i18n key. Replaces a dynamic
 * `'onboarding.steps.' + step + '.label'` concat — the parity check
 * spec scans for literal keys, so concatenation would silently
 * bypass it. Mirroring the allowlist here keeps the parity guarantee
 * intact and makes the SPA-to-translation contract grep-able.
 */
const STEP_LABEL_KEY: Record<OnboardingStep, string> = {
  add_athlete: 'onboarding.steps.add_athlete.label',
  set_timetable: 'onboarding.steps.set_timetable.label',
  write_syllabus: 'onboarding.steps.write_syllabus.label',
  log_attendance: 'onboarding.steps.log_attendance.label',
  mark_payment: 'onboarding.steps.mark_payment.label',
  upload_document: 'onboarding.steps.upload_document.label',
  view_stats: 'onboarding.steps.view_stats.label',
};
const STEP_HINT_KEY: Record<OnboardingStep, string> = {
  add_athlete: 'onboarding.steps.add_athlete.hint',
  set_timetable: 'onboarding.steps.set_timetable.hint',
  write_syllabus: 'onboarding.steps.write_syllabus.hint',
  log_attendance: 'onboarding.steps.log_attendance.hint',
  mark_payment: 'onboarding.steps.mark_payment.hint',
  upload_document: 'onboarding.steps.upload_document.hint',
  view_stats: 'onboarding.steps.view_stats.hint',
};

/**
 * "Getting started" checklist card (#424). Renders one row per
 * onboarding step on Today, the first screen, while the user hasn't
 * dismissed the tour AND hasn't completed every step.
 *
 * Each row has:
 *  - A leading status icon (check when completed, dot when pending).
 *  - The step label + a one-line hint (i18n).
 *  - A "Do it" CTA that navigates to the corresponding feature
 *    surface AND fires `completeStep` so the SPA-side optimistic
 *    state ticks immediately. Idempotent on the server.
 *
 * The card carries a "Dismiss" link in the header that fires a
 * confirmation popup ("won't show again — sure?") because the
 * action is irreversible from the UI (no "re-show tour" surface
 * shipped today).
 *
 * Mounted once, on Today (`/dashboard/today`, where `/dashboard`
 * lands since #1643), which also loads its state (#1755). Not on a
 * second screen: two instances of a widget whose dismissal is
 * forever would disagree the moment one of them is dismissed.
 */
@Component({
  selector: 'app-onboarding-checklist',
  standalone: true,
  imports: [ButtonModule, ConfirmPopupModule, TooltipModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './onboarding-checklist.component.html',
  styleUrl: './onboarding-checklist.component.scss',
  providers: [ConfirmationService],
})
export class OnboardingChecklistComponent {
  private readonly onboardingService = inject(OnboardingService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly steps = ONBOARDING_STEPS;
  protected readonly visible = this.onboardingService.checklistVisible;
  protected readonly progress = this.onboardingService.progress;
  protected readonly total = ONBOARDING_STEPS.length;

  protected readonly completedSet = computed(
    () => new Set<string>(this.onboardingService.completedSteps()),
  );

  protected isCompleted(step: OnboardingStep): boolean {
    return this.completedSet().has(step);
  }

  protected labelKey(step: OnboardingStep): string {
    return STEP_LABEL_KEY[step];
  }
  protected hintKey(step: OnboardingStep): string {
    return STEP_HINT_KEY[step];
  }

  protected goTo(step: OnboardingStep): void {
    const route = this.routeFor(step);
    this.router.navigate([route]);
    this.onboardingService.completeStep(step).subscribe({
      // Background fire — the SPA-side state ticks via the service's
      // tap. No toast on success; the visual tick on the row is
      // enough feedback (Norman § feedback — the user can SEE the
      // row flip to "Done" inline).
      error: () => {
        // Silent — the user is being navigated; surfacing a toast on
        // a corner the user is about to leave is noise. The next
        // load() rehydrates the truthful state.
      },
    });
  }

  protected confirmDismiss(event: MouseEvent): void {
    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('onboarding.checklist.confirmDismiss'),
      acceptLabel: this.translate.instant('onboarding.checklist.confirmDismissAccept'),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: CONFIRM_REJECT_BUTTON,
      accept: () => this.dismiss(),
    });
  }

  private dismiss(): void {
    this.onboardingService.dismiss().subscribe({
      next: () => {
        this.messageService.add({
          severity: 'info',
          summary: this.translate.instant('onboarding.checklist.dismissedSummary'),
        });
      },
    });
  }

  private routeFor(step: OnboardingStep): string {
    switch (step) {
      case 'add_athlete':
        return '/dashboard/athletes/new';
      case 'set_timetable':
        return '/dashboard/academy/timetable';
      case 'write_syllabus':
        return '/dashboard/academy/syllabus';
      case 'log_attendance':
        return '/dashboard/attendance';
      case 'mark_payment':
        return '/dashboard/athletes';
      case 'upload_document':
        return '/dashboard/athletes';
      case 'view_stats':
        return '/dashboard/stats';
    }
  }
}
