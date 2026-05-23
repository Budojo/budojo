import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { map } from 'rxjs/operators';
import {
  GetRecapResult,
  WeeklyRecap,
  WeeklyRecapService,
} from '../../core/services/weekly-recap.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Weekly recap landing page (#960). Reached from the Sunday 19:00
 * push deep-link. Shows the headline numbers (sessions + hours + top
 * partners) for the iso week passed in the URL, plus a "Condividi"
 * button.
 *
 * Three template states:
 *  - `loading` — initial mount.
 *  - `ok` — recap loaded.
 *  - `error` — bad week param OR no athlete row OR network. Single
 *    panel to avoid form-fill ambiguity (the recap is a leaf surface,
 *    not interactive — falling through is the right UX).
 */
@Component({
  selector: 'app-my-recap',
  standalone: true,
  imports: [RouterLink, TranslatePipe, ButtonModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-recap.component.html',
  styleUrl: './my-recap.component.scss',
})
export class MyRecapComponent {
  private readonly recapService = inject(WeeklyRecapService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly messageService = inject(MessageService);

  /** ISO Monday from the route param (':isoWeek'). */
  protected readonly isoWeek = toSignal(
    this.route.paramMap.pipe(map((m) => m.get('isoWeek') ?? '')),
    { initialValue: '' },
  );

  protected readonly status = signal<'loading' | 'ok' | 'error'>('loading');
  protected readonly recap = signal<WeeklyRecap | null>(null);

  /** Headline label for the page — formatted week range. */
  protected readonly weekLabel = computed<string>(() => {
    const start = this.isoWeek();
    if (!start) return '';
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const lang = this.translate.currentLang || 'en';
    const fmt = (d: Date): string => d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
    return `${fmt(startDate)} → ${fmt(endDate)}`;
  });

  constructor() {
    this.recapService
      .getRecap(this.isoWeek())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result: GetRecapResult) => {
          if (result.status === 'ok') {
            this.recap.set(result.recap);
            this.status.set('ok');
          } else if (result.status === 'no-athlete') {
            void this.router.navigateByUrl('/dashboard');
          } else {
            this.status.set('error');
          }
        },
        error: () => this.status.set('error'),
      });
  }

  /**
   * Share the recap as a friendly text-summary via the Web Share API
   * — no card image for V1 (recap card is a separate iteration if
   * adoption justifies the extra layout work).
   */
  protected async onShare(): Promise<void> {
    const r = this.recap();
    if (r === null) return;

    const text = this.translate.instant('myRecap.shareCaption', {
      sessions: r.sessions,
      hours: r.hours.toFixed(1),
    });

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: this.translate.instant('myRecap.shareTitle'),
          text,
        });
      } catch (err) {
        // Silent on user cancel.
        const aborted =
          err instanceof DOMException &&
          (err.name === 'AbortError' || err.name === 'NotAllowedError');
        if (!aborted) {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('myRecap.shareErrorSummary'),
            life: 5000,
          });
        }
      }
    } else {
      // Fallback: copy to clipboard.
      await navigator.clipboard.writeText(text);
      this.messageService.add({
        severity: 'info',
        summary: this.translate.instant('myRecap.copiedSummary'),
        life: 3000,
      });
    }
  }
}
